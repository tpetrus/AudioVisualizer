// The part of the scorecard runner that touches files, kept apart from run.ts so it can be tested without a command line:
// argument parsing, reading the track folder, and turning tracks into measures.

import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import type { BeatSidecar } from '../../app/features/rhythm/eval/evalTypes';
import { parseBeatSidecar } from '../../app/features/rhythm/eval/sidecar';
import { GROUND_TRUTH_TRACKS, renderGroundTruthTrack } from '../ground-truth/render';
import { measureSetDirector, type SetDirectorMeasure } from './engine/setDirector';
import { readWav } from '../rhythm-tools/wav';
import { measureTrack } from './engine/measureTrack';
import { LIVE_FILE } from './live/args';
import { TARGETS_VERSION } from './targets';
import { EXPECTED_TRACKS, resolveTrack } from './tracks';
import type { ScorecardInput } from './cells';
import type { Scorecard, ScorecardCell, TrackClass, TrackMeasures } from './types';

export interface RunArgs {
    dir: string;
    out: string;
    writeBaseline: boolean;
    help: boolean;
}

export const DEFAULT_DIR = '.debug-in';
// Not docs/agents/hub-scorecard: that name is the findings doc, which a run would overwrite.
export const DEFAULT_OUT = 'docs/agents/hub-scorecard.cells';
export const BASELINE_PATH = 'docs/agents/hub-scorecard.baseline.json';
// Where `npm run scorecard:live` writes; this runner merges it in when it exists.
export const LIVE_PATH = LIVE_FILE;

export function parseRunArgs(argv: readonly string[]): RunArgs {
    const args: RunArgs = { dir: DEFAULT_DIR, out: DEFAULT_OUT, writeBaseline: false, help: false };
    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i];
        if (arg === '--help' || arg === '-h') args.help = true;
        else if (arg === '--write-baseline') args.writeBaseline = true;
        else if (arg === '--dir' || arg === '--out') {
            const value = argv[++i];
            if (value === undefined || value.startsWith('--')) throw new Error(`${arg} needs a value`);
            if (arg === '--dir') args.dir = value;
            else args.out = value;
        } else {
            throw new Error(`Unexpected argument "${arg}"`);
        }
    }
    return args;
}

// A track ready to measure: its audio and whatever truth came with it.
export interface TrackSource {
    // Audio file name with its extension.
    name: string;
    class: TrackClass;
    pcm: Float32Array;
    sampleRate: number;
    sidecar?: BeatSidecar;
    // Tempo from a .bpm file, when there is one.
    bpm?: number;
    // SHA-256 (hex) of the .beats.json this track read.
    sidecarHash?: string;
}

export interface LoadedTracks {
    sources: TrackSource[];
    // Things the user should know: tracks that could not be measured, and tracks outside the expected list.
    warnings: string[];
}

export const sha256 = (text: string): string => createHash('sha256').update(text).digest('hex');

const stemOf = (name: string): string => name.replace(/\.wav$/i, '');

// Reads every WAV in `dir`, and renders the generated expected tracks that are not in the folder. A track with no tempo
// truth (no sidecar tempo and no .bpm) that is not beatless cannot be scored, so it is left out and stays unavailable.
export function loadTracks(dir: string): LoadedTracks {
    const warnings: string[] = [];
    const sources: TrackSource[] = [];
    const expected = new Set(EXPECTED_TRACKS.map((track) => track.name));
    const names = existsSync(dir) ? readdirSync(dir).filter((file) => /\.wav$/i.test(file)) : [];
    if (names.length === 0) warnings.push(`no WAV files found in ${dir}`);

    for (const name of [...names].sort()) {
        if (!expected.has(name))
            warnings.push(`${name} is not in the expected track list; measured, but no cells use it`);
        const stem = stemOf(name);
        let sidecar: BeatSidecar | undefined;
        let sidecarHash: string | undefined;
        const beatsPath = join(dir, `${stem}.beats.json`);
        if (existsSync(beatsPath)) {
            const text = readFileSync(beatsPath, 'utf8');
            try {
                sidecar = parseBeatSidecar(text);
            } catch (error) {
                throw new Error(`${stem}.beats.json: ${(error as Error).message}`);
            }
            sidecarHash = sha256(text);
        }
        let bpm: number | undefined;
        const bpmPath = join(dir, `${stem}.bpm`);
        if (existsSync(bpmPath)) {
            const value = Number(readFileSync(bpmPath, 'utf8').trim());
            if (value > 0 && Number.isFinite(value)) bpm = value;
            else warnings.push(`${stem}.bpm does not hold a tempo above 0; ignored`);
        }
        const trackClass = resolveTrack(name, sidecar?.source).class;
        if (trackClass !== 'beatless' && sidecar === undefined && bpm === undefined) {
            warnings.push(`${name} has no tempo truth (no .beats.json or .bpm); not measured`);
            continue;
        }
        const { sampleRate, samples } = readWav(readFileSync(join(dir, name)));
        sources.push({ name, class: trackClass, pcm: samples, sampleRate, sidecar, bpm, sidecarHash });
    }

    // The generated tracks are rendered in memory so the folder does not need them.
    for (const spec of EXPECTED_TRACKS.filter((track) => track.generated)) {
        if (sources.some((source) => source.name === spec.name)) continue;
        const truth = GROUND_TRUTH_TRACKS.find((track) => `${track.name}.wav` === spec.name);
        if (truth === undefined) {
            warnings.push(`${spec.name} is generated but has no ground-truth spec; not measured`);
            continue;
        }
        const { pcm, sidecar } = renderGroundTruthTrack(truth);
        sources.push({ name: spec.name, class: spec.class, pcm, sampleRate: 44100, sidecar });
    }
    return { sources, warnings };
}

// Measures every source and gathers what buildScorecard needs besides the scenarios and the revision.
export function measureSources(
    sources: readonly TrackSource[],
    onTrack?: (name: string, seconds: number) => void,
): Pick<ScorecardInput, 'measures' | 'sidecarHashes' | 'available' | 'setDirector'> {
    const measures: TrackMeasures[] = [];
    const setDirector: SetDirectorMeasure[] = [];
    const sidecarHashes: Record<string, string> = {};
    const available: ScorecardInput['available'] = [];
    for (const source of sources) {
        const started = Date.now();
        measures.push(
            measureTrack({
                track: source.name,
                class: source.class,
                pcm: source.pcm,
                sampleRate: source.sampleRate,
                sidecar: source.sidecar,
                bpm: source.bpm,
            }),
        );
        // bass-ink's set director, advisory (AC6): only on real music, the only tracks setDirectorCells reports.
        if (source.class !== 'synthetic')
            setDirector.push(measureSetDirector(source.name, source.pcm, source.sampleRate));
        available.push({ track: source.name, hasBeats: source.sidecar !== undefined });
        // Generated tracks have a sidecar too, but it is not a file the user can change, so it is not hashed.
        if (source.sidecarHash !== undefined) sidecarHashes[source.name] = source.sidecarHash;
        onTrack?.(source.name, (Date.now() - started) / 1000);
    }
    return { measures, sidecarHashes, available, setDirector };
}

// The one-line summary the runner prints; the same counts the markdown report opens with.
export function summaryLine(scorecard: Scorecard): string {
    const applicable = scorecard.cells.filter((cell) => cell.applicable);
    const count = (status: ScorecardCell['status']): number =>
        applicable.filter((cell) => cell.status === status).length;
    const blockingFailures = applicable.filter((cell) => cell.blocking && !cell.pass).length;
    return `Applicable cells ${applicable.length}: ${count('pass')} passing, ${count('fail')} failing, ${count('unavailable')} unavailable. Blocking failures: ${blockingFailures}.`;
}

// The live cells to merge into the scorecard: those of the live file, when it exists and was written for this targets
// version. A file of another version is left out with a warning, since its floors and metrics are not this build's.
// No file gives no cells and no warning, so the offline output does not change.
export function readLiveCells(path: string): { cells: ScorecardCell[]; warning?: string } {
    if (!existsSync(path)) return { cells: [] };
    const file = JSON.parse(readFileSync(path, 'utf8')) as Partial<Scorecard>;
    const version = file.header?.targetsVersion;
    if (version !== TARGETS_VERSION) {
        return {
            cells: [],
            warning: `${path} is targets version ${version}, this build is ${TARGETS_VERSION}; the live cells are left out`,
        };
    }
    return { cells: file.cells ?? [] };
}

// Plain code-unit order, so the output does not depend on the machine's locale.
const compare = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

// Adds live cells to a scorecard, keeping the cell order (metric, track, visualizer). With no live cells the scorecard
// is returned as it is.
export function withLiveCells(scorecard: Scorecard, live: readonly ScorecardCell[]): Scorecard {
    if (live.length === 0) return scorecard;
    const cells = [...scorecard.cells, ...live].sort(
        (a, b) => compare(a.metric, b.metric) || compare(a.track, b.track) || compare(a.visualizer, b.visualizer),
    );
    return { ...scorecard, cells };
}
