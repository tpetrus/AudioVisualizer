// `npm run sweep:gate`: tunes the dancer's bass gate rule (app/features/rhythm/bassGate.ts) by overriding constants of
// bassGateConfig.ts, cheaply. The expensive replay (tracker, hub, bump envelope) runs once per track and per random
// pattern with the shipped code and records what the gate was stepped with; only the gate is stepped again per row of
// overrides. Not part of the app bundle: nothing under app/ imports this file.
//
// Why re-stepping the gate alone is valid: the gate reads only the values a GateTrace records (see gateTrace.ts), and
// nothing in the replay pipeline except the gate imports bassGateConfig.ts (the replay imports stepBassGate itself), so
// a recording made with the shipped constants is the recording the pipeline would make with any override.

import { resolve } from 'node:path';
import { applyOverrides, parseOverride, type Override } from '../rhythm-tools/ablate';
import { loadWithOverrides } from '../rhythm-tools/ablatePlugin';
import { expandGrid, splitGridValues, type GridAxis } from '../rhythm-tools/onsetSweep';
import { RANDOM_BASS_BPM, RANDOM_BASS_SAMPLE_RATE, createRandom, randomBassPcm } from './engine/gateInputs';
import { GateTrace, bumpTimes, bumpsOnBeat, firstOpenSeconds, type GateStepper } from './engine/gateTrace';
import { replayPcm } from './engine/replay';
import { DEFAULT_DIR, loadTracks } from './inputs';
import { METRICS, liveFireHitsBeat, meetsFloor } from './targets';
import { resolveTrack } from './tracks';

const GATE_SOURCE = 'app/features/rhythm/bassGate.ts';
export const GATE_CONFIG = 'app/features/rhythm/bassGateConfig.ts';
const GATE_CONFIG_NAME = 'bassGateConfig.ts';

export const USAGE = `Usage: npm run sweep:gate -- [--dir <folder>] [--patterns N] [--beats 120,400] [--set NAME=VALUE]...
                            [--grid NAME=v1,v2,...]... [--lock-at S] [--notes-per-beat N] [--beats-per-note K]
                            [--detail] [--json <file>]

Replays every track and random pattern once with the shipped code, then steps only the dancer's bass gate (bassGate.ts) per
row, with constants of ${GATE_CONFIG_NAME} overridden. Rows: base (no overrides), then every combination of the --grid values,
each with every --set applied. NAME must be an exported constant of ${GATE_CONFIG_NAME}; VALUE is a number, arithmetic or a
[ ] list, as for ablate:rhythm. A repeated --grid NAME adds values to its axis.
Per row: false opens of the gate on N seeded random-bass patterns (default 300) for each beat count (default 120,400), the
gate column of probe:gate-inputs; on kick tracks of <folder> (default ${DEFAULT_DIR}) how many open within 4 s and 2 s of the
dancer's lock and the sum and max of the seconds after it (the rest of the track if the gate never opens); on no-kick tracks
the names whose gate opened. --lock-at S hides the random bass's beat clock for its first S seconds (default 0), so the
false opens include what the gate does before a lock. --notes-per-beat N and --beats-per-note K change the random bass
from two notes in every beat (the default) to N notes at random places in every K beats, so 1 and 2 is one random note
every two beats, the sparse bass of FU-S5-sparse-false-opens (the other options still apply). on-beat: kick tracks whose bumps mostly hit a labelled beat (the live hit window on the bump starts; tracks with a
.beats.json). --detail adds per track the seconds after the lock and where the bumps land; --json writes everything.`;

// How the random bass is laid out: `notesPerBeat` notes at random places in every `beatsPerNote` beats. The default, two
// notes in every beat, is the pattern of the gate specs and of probe:gate-inputs (randomBassPcm).
export interface BassPattern {
    notesPerBeat: number;
    beatsPerNote: number;
}

// Same note shape as randomBassPcm's (a low sine with a short attack and a decay, see gateInputs.ts), so a sparse pattern
// goes through the same analysis chains. The random draws are in the same order (place, pitch, gain), so the default
// pattern reproduces randomBassPcm sample for sample. Notes of the same pattern can overlap, as they can there.
const NOTE_MIN_HZ = 45;
const NOTE_MAX_HZ = 100;
const NOTE_MIN_GAIN = 0.3;
const NOTE_MAX_GAIN = 0.5;
const NOTE_ATTACK_SECONDS = 0.005;
const NOTE_DECAY_SECONDS = 0.06;
const NOTE_SECONDS = 0.25;
const TAIL_SECONDS = 0.5;

export function patternBassPcm(seed: number, beats: number, pattern: BassPattern): Float32Array {
    const random = createRandom(seed);
    const secondsPerBeat = 60 / RANDOM_BASS_BPM;
    const pcm = new Float32Array(Math.ceil((beats * secondsPerBeat + TAIL_SECONDS) * RANDOM_BASS_SAMPLE_RATE));
    for (let group = 0; group * pattern.beatsPerNote < beats; group++) {
        for (let note = 0; note < pattern.notesPerBeat; note++) {
            const place = (group + random()) * pattern.beatsPerNote;
            const hz = NOTE_MIN_HZ + random() * (NOTE_MAX_HZ - NOTE_MIN_HZ);
            const gain = NOTE_MIN_GAIN + random() * (NOTE_MAX_GAIN - NOTE_MIN_GAIN);
            const start = Math.floor(place * secondsPerBeat * RANDOM_BASS_SAMPLE_RATE);
            const end = Math.min(pcm.length, start + Math.round(NOTE_SECONDS * RANDOM_BASS_SAMPLE_RATE));
            for (let i = start; i < end; i++) {
                const t = (i - start) / RANDOM_BASS_SAMPLE_RATE;
                const envelope = Math.min(1, t / NOTE_ATTACK_SECONDS) * Math.exp(-t / NOTE_DECAY_SECONDS);
                pcm[i] += gain * envelope * Math.sin(2 * Math.PI * hz * t);
            }
        }
    }
    return pcm;
}

export interface SweepArgs {
    dir: string;
    patterns: number;
    beats: number[];
    lockAt: number;
    pattern: BassPattern;
    set: Override[];
    grid: GridAxis[];
    detail: boolean;
    json: string | undefined;
    help: boolean;
}

function positiveInteger(flag: string, text: string): number {
    const value = Number(text);
    if (!Number.isInteger(value) || value < 1) throw new Error(`${flag} needs a whole number above 0, got ${text}`);
    return value;
}

export function parseSweepGateArgs(argv: readonly string[]): SweepArgs {
    const args: SweepArgs = {
        dir: DEFAULT_DIR,
        patterns: 300,
        beats: [120, 400],
        lockAt: 0,
        pattern: { notesPerBeat: 2, beatsPerNote: 1 },
        set: [],
        grid: [],
        detail: false,
        json: undefined,
        help: false,
    };
    for (let i = 0; i < argv.length; i++) {
        const flag = argv[i];
        const value = (): string => {
            const next = argv[++i];
            if (next === undefined || next.startsWith('--')) throw new Error(`${flag} needs a value`);
            return next;
        };
        switch (flag) {
            case '--help':
            case '-h':
                args.help = true;
                break;
            case '--detail':
                args.detail = true;
                break;
            case '--dir':
                args.dir = value();
                break;
            case '--json':
                args.json = value();
                break;
            case '--patterns':
                args.patterns = positiveInteger(flag, value());
                break;
            case '--beats':
                args.beats = value()
                    .split(',')
                    .map((part) => positiveInteger(flag, part));
                break;
            case '--lock-at': {
                const text = value();
                const seconds = Number(text);
                if (!Number.isFinite(seconds) || seconds < 0)
                    throw new Error(`${flag} needs seconds of 0 or more, got ${text}`);
                args.lockAt = seconds;
                break;
            }
            case '--notes-per-beat':
                args.pattern.notesPerBeat = positiveInteger(flag, value());
                break;
            case '--beats-per-note':
                args.pattern.beatsPerNote = positiveInteger(flag, value());
                break;
            case '--set':
                args.set.push(parseOverride(value()));
                break;
            case '--grid': {
                const text = value();
                const at = text.indexOf('=');
                const name = at < 0 ? '' : text.slice(0, at).trim();
                const values = at < 0 ? [] : splitGridValues(text.slice(at + 1));
                if (values.length === 0 || values.some((entry) => entry.trim() === '')) {
                    throw new Error(`--grid needs NAME=v1,v2,..., got "${text}"`);
                }
                // parseOverride validates the name and that each value holds only numbers, arithmetic and lists.
                const parsed = values.map((entry) => parseOverride(`${name}=${entry}`).value);
                const existing = args.grid.find((axis) => axis.name === name);
                if (existing === undefined) args.grid.push({ name, values: parsed });
                else existing.values.push(...parsed);
                break;
            }
            default:
                throw new Error(`Unknown option ${flag}\n\n${USAGE}`);
        }
    }
    const seen = new Set<string>();
    for (const name of [...args.grid.map((axis) => axis.name), ...args.set.map((entry) => entry.name)]) {
        if (seen.has(name)) throw new Error(`${name} was given twice (--grid and --set count together)`);
        seen.add(name);
    }
    return args;
}

export interface Row {
    label: string;
    overrides: Override[];
}

export const BASE_LABEL = 'base';

const labelOf = (overrides: readonly Override[]): string =>
    overrides.length === 0 ? BASE_LABEL : overrides.map((entry) => `${entry.name}=${entry.value}`).join(' ');

// The base row (no overrides) first, then the cartesian product of the grid with every --set applied. With --set and no
// grid that is the base plus one row; with neither it is the base alone.
export function expandRows(set: readonly Override[], grid: readonly GridAxis[]): Row[] {
    const rows: Row[] = [{ label: BASE_LABEL, overrides: [] }];
    if (set.length === 0 && grid.length === 0) return rows;
    for (const point of expandGrid(grid)) {
        const overrides = [...set, ...point];
        rows.push({ label: labelOf(overrides), overrides });
    }
    return rows;
}

// Checks every name against the config source before anything is bundled, so a mistyped name fails with its own message
// rather than esbuild's wrapper around it.
export function validateRows(rows: readonly Row[], configSource: string): void {
    for (const row of rows) applyOverrides(configSource, row.overrides, GATE_CONFIG_NAME);
}

// bassGate.ts bundled with the overrides applied to bassGateConfig.ts; with none it is the shipped rule.
export async function loadGateStepper(overrides: readonly Override[]): Promise<GateStepper> {
    const source = JSON.stringify(resolve(GATE_SOURCE).replace(/\\/g, '/'));
    const contents = `export { createBassGateState, stepBassGate } from ${source};`;
    return (await loadWithOverrides(
        { stdin: { contents, resolveDir: resolve('.'), loader: 'ts' } },
        overrides,
        GATE_CONFIG_NAME,
    )) as GateStepper;
}

// Replays once with a trace attached and returns both. Whatever is stepped from the trace must agree with the replay's
// own gate for the shipped rule; the base row is checked against it as a guard on the recording.
function record(
    pcm: Float32Array,
    sampleRate: number,
    lockedTempo?: number,
): { trace: GateTrace; seconds: number; lock: number | null; shipped: number | null } {
    const trace = new GateTrace();
    const replay = replayPcm(pcm, sampleRate, { lockedTempo, gateTrace: trace });
    return {
        trace,
        seconds: replay.seconds,
        lock: replay.dancerLockSeconds,
        shipped: replay.gate.firstOpenSeconds,
    };
}

// The recorded trace steps the base rule to the replay's own opening, or the sweep would be measuring something else.
function checkBase(where: string, row: Row, opening: number | null, shipped: number | null): void {
    if (row.overrides.length === 0 && opening !== shipped) {
        throw new Error(`${where}: the base row opens at ${opening} but the replay's gate at ${shipped}`);
    }
}

export interface TrackOutcome {
    // Seconds from the dancer's lock to the first opening (the rest of the track if it never opens); null when the dancer
    // never locks.
    secondsAfterLock: number | null;
    opened: boolean;
    // Where the gate's bumps land against the track's labelled beats; null without bumps or a .beats.json.
    onBeat?: { share: number; medianMs: number } | null;
}

export interface RowResult {
    label: string;
    overrides: Override[];
    falseOpens: Record<string, number>;
    kickTracks: Record<string, TrackOutcome>;
    noKickOpened: string[];
}

export interface SweepResult {
    patterns: number;
    beats: number[];
    // Seconds of the random bass's beat clock hidden from the gate (--lock-at).
    lockAt: number;
    pattern: BassPattern;
    rows: RowResult[];
    // The dancer's lock time per scored track (kick and no-kick), null where it never locks.
    dancerLockSeconds: Record<string, number | null>;
}

const metric = (id: string) => {
    const found = METRICS.find((candidate) => candidate.id === id);
    if (found === undefined) throw new Error(`targets.ts has no metric ${id}`);
    return found;
};

export interface Summary {
    locked: number;
    within4: number;
    within2: number;
    sum: number;
    max: number;
    // Kick tracks whose bumps hit a labelled beat at least half the time, of those with bumps and beats.
    onBeat: number;
    onBeatMeasured: number;
}

// The floor and stretch of gate.secondsAfterLock are the 4 s and 2 s of the contract, read from the target table.
export function summarizeKickTracks(outcomes: readonly TrackOutcome[]): Summary {
    const target = metric('gate.secondsAfterLock');
    const summary: Summary = { locked: 0, within4: 0, within2: 0, sum: 0, max: 0, onBeat: 0, onBeatMeasured: 0 };
    for (const outcome of outcomes) {
        if (outcome.secondsAfterLock === null) continue;
        summary.locked++;
        summary.sum += outcome.secondsAfterLock;
        summary.max = Math.max(summary.max, outcome.secondsAfterLock);
        if (outcome.onBeat) {
            summary.onBeatMeasured++;
            if (outcome.onBeat.share >= 0.5) summary.onBeat++;
        }
        if (!outcome.opened) continue;
        if (meetsFloor('lower', outcome.secondsAfterLock, target.floor)) summary.within4++;
        if (meetsFloor('lower', outcome.secondsAfterLock, target.stretch)) summary.within2++;
    }
    return summary;
}

type Log = (text: string) => void;

export async function runSweep(
    args: Pick<SweepArgs, 'dir' | 'patterns' | 'beats'> & Partial<Pick<SweepArgs, 'lockAt' | 'pattern'>>,
    rows: readonly Row[],
    log: Log,
    progress: Log = () => {},
): Promise<SweepResult> {
    const lockAt = args.lockAt ?? 0;
    const pattern = args.pattern ?? { notesPerBeat: 2, beatsPerNote: 1 };
    const defaultPattern = pattern.notesPerBeat === 2 && pattern.beatsPerNote === 1;
    let phase = Date.now();
    const lap = (name: string): void => {
        log(`${name}: ${((Date.now() - phase) / 1000).toFixed(1)} s`);
        phase = Date.now();
    };

    const steppers = await Promise.all(rows.map((row) => loadGateStepper(row.overrides)));
    lap(`Bundled the gate for ${rows.length} row(s)`);

    const results: RowResult[] = rows.map((row) => ({
        label: row.label,
        overrides: row.overrides,
        falseOpens: {},
        kickTracks: {},
        noKickOpened: [],
    }));

    // The random bass of probe:gate-inputs: the same seeds, notes and locked beat clock, so the base row is its gateBass
    // column. Each pattern is replayed once and its trace stepped by every row before the next pattern.
    for (const beats of args.beats) {
        for (const result of results) result.falseOpens[String(beats)] = 0;
        for (let seed = 1; seed <= args.patterns; seed++) {
            const { trace, shipped } = record(
                defaultPattern ? randomBassPcm(seed, beats) : patternBassPcm(seed, beats, pattern),
                RANDOM_BASS_SAMPLE_RATE,
                RANDOM_BASS_BPM,
            );
            rows.forEach((row, index) => {
                const opening = firstOpenSeconds(trace, steppers[index], lockAt);
                // A hidden lock is not what the replay's own gate saw, so there is nothing to check the base row against.
                if (lockAt === 0) checkBase(`${beats} beats, seed ${seed}`, row, opening, shipped);
                if (opening !== null) results[index].falseOpens[String(beats)]++;
            });
            if (seed % 50 === 0) progress(`  ${beats} beats: ${seed} of ${args.patterns}`);
        }
    }
    lap(`Random bass (${args.patterns} patterns x ${args.beats.join(', ')} beats)`);

    const { sources, warnings } = loadTracks(resolve(args.dir));
    for (const warning of warnings) log(`warning: ${warning}`);
    const afterLock = metric('gate.secondsAfterLock');
    const closedOnNoKick = metric('gate.closedOnNoKick');
    const dancerLockSeconds: Record<string, number | null> = {};
    for (const source of sources) {
        const { kick } = resolveTrack(source.name);
        const kickTrack = afterLock.applies(source.class, kick);
        const noKickTrack = closedOnNoKick.applies(source.class, kick);
        if (!kickTrack && !noKickTrack) continue;
        const { trace, seconds, lock, shipped } = record(source.pcm, source.sampleRate);
        dancerLockSeconds[source.name] = lock;
        rows.forEach((row, index) => {
            const opening = firstOpenSeconds(trace, steppers[index]);
            checkBase(source.name, row, opening, shipped);
            if (kickTrack) {
                results[index].kickTracks[source.name] = {
                    secondsAfterLock: lock === null ? null : (opening ?? seconds) - lock,
                    opened: opening !== null,
                    onBeat: bumpsOnBeat(
                        bumpTimes(trace, steppers[index]),
                        source.sidecar?.beats ?? [],
                        liveFireHitsBeat,
                    ),
                };
            } else if (opening !== null) {
                results[index].noKickOpened.push(source.name);
            }
        });
        progress(`  ${source.name}`);
    }
    lap('Tracks');
    return { patterns: args.patterns, beats: [...args.beats], lockAt, pattern, rows: results, dancerLockSeconds };
}

const pad = (text: string, width: number): string => text.padStart(width);

export function formatSweep(result: SweepResult, detail: boolean): string[] {
    const lines: string[] = [];
    const headers = [...result.beats.map((beats) => `fo@${beats}`), '<=4s', '<=2s', 'sum', 'max', 'on-beat'];
    const labelWidth = Math.max(5, ...result.rows.map((row) => row.label.length));
    lines.push(
        `fo@N: false opens of ${result.patterns} random-bass patterns of N beats (${result.pattern.notesPerBeat} note(s) in every ${result.pattern.beatsPerNote} beat(s))${result.lockAt > 0 ? ` (beat clock hidden for ${result.lockAt} s)` : ''}. <=4s and <=2s: kick tracks within that many seconds of the dancer lock.`,
    );
    lines.push(['row'.padEnd(labelWidth), ...headers.map((text) => pad(text, 8)), '  no-kick opened'].join(' '));
    for (const row of result.rows) {
        const summary = summarizeKickTracks(Object.values(row.kickTracks));
        const cells = [
            ...result.beats.map((beats) => String(row.falseOpens[String(beats)])),
            `${summary.within4}/${summary.locked}`,
            `${summary.within2}/${summary.locked}`,
            summary.sum.toFixed(1),
            summary.max.toFixed(2),
            `${summary.onBeat}/${summary.onBeatMeasured}`,
        ];
        const opened = row.noKickOpened.length === 0 ? 'none' : row.noKickOpened.join(', ');
        lines.push([row.label.padEnd(labelWidth), ...cells.map((text) => pad(text, 8)), `  ${opened}`].join(' '));
    }
    const neverLocked = Object.keys(result.rows[0].kickTracks).filter(
        (name) => result.dancerLockSeconds[name] === null,
    );
    lines.push(
        `Kick tracks whose dancer never locks (excluded from the sums): ${neverLocked.length === 0 ? 'none' : neverLocked.join(', ')}`,
    );
    if (detail) {
        lines.push(
            '',
            'Seconds after the dancer lock per track (* = the gate never opened, the rest of the track is counted)',
        );
        result.rows.forEach((row, index) => lines.push(`  row ${index}: ${row.label}`));
        const columns = result.rows.map((_row, index) => pad(`row ${index}`, 9));
        lines.push(['track'.padEnd(26), pad('lock', 8), ...columns].join(' '));
        for (const name of Object.keys(result.rows[0].kickTracks)) {
            const lock = result.dancerLockSeconds[name];
            const cells = result.rows.map((row) => {
                const outcome = row.kickTracks[name];
                if (outcome.secondsAfterLock === null) return pad('never', 9);
                return pad(`${outcome.secondsAfterLock.toFixed(2)}${outcome.opened ? '' : '*'}`, 9);
            });
            lines.push([name.padEnd(26), pad(lock === null ? 'never' : lock.toFixed(2), 8), ...cells].join(' '));
        }
        lines.push('', 'Bumps that hit a labelled beat per track, and their median distance to the nearest beat in ms');
        lines.push(['track'.padEnd(26), pad('', 8), ...columns].join(' '));
        for (const name of Object.keys(result.rows[0].kickTracks)) {
            const cells = result.rows.map((row) => {
                const onBeat = row.kickTracks[name].onBeat;
                return pad(onBeat ? `${onBeat.share.toFixed(2)} ${onBeat.medianMs.toFixed(0)}` : '-', 9);
            });
            lines.push([name.padEnd(26), pad('', 8), ...cells].join(' '));
        }
    }
    return lines;
}

// The JSON of `--json`: the same numbers as the printout, without timings, so equal arguments give equal files.
export function sweepJson(result: SweepResult): unknown {
    return {
        patterns: result.patterns,
        beats: result.beats,
        lockAt: result.lockAt,
        pattern: result.pattern,
        dancerLockSeconds: result.dancerLockSeconds,
        rows: result.rows.map((row) => ({
            label: row.label,
            overrides: row.overrides,
            falseOpens: row.falseOpens,
            // Seconds after the lock; null where the dancer never locks. A gate that never opens counts the rest of the
            // track and is also listed in neverOpened.
            secondsAfterLock: Object.fromEntries(
                Object.entries(row.kickTracks).map(([name, outcome]) => [name, outcome.secondsAfterLock]),
            ),
            onBeat: Object.fromEntries(
                Object.entries(row.kickTracks).map(([name, outcome]) => [name, outcome.onBeat ?? null]),
            ),
            neverOpened: Object.entries(row.kickTracks)
                .filter(([, outcome]) => !outcome.opened)
                .map(([name]) => name),
            noKickOpened: row.noKickOpened,
        })),
    };
}
