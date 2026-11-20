import { BassBump, GATE_BASS_BUMP } from '../../app/features/audio/hub/bassBump';
import type { TelemetryTable } from '../../app/features/audio/devTelemetrySummary';
import { createBassGateState, stepBassGate, type BassGateState } from '../../app/features/rhythm/bassGate';
import type { RhythmState } from '../../app/features/rhythm/types';

// Replays a recording's gate inputs through a gate rule. The recorded columns are what the live gate was given, so the
// real stepBassGate gives back what the recording shows, unless the rule differs.

export type GateStep = (
    bass: number,
    rhythm: Readonly<RhythmState>,
    tempoLocked: boolean,
    state: BassGateState,
    dt: number,
) => number;

export interface GateRule {
    description: string;
    step: GateStep;
}

// The named rules. A candidate is one more entry here. A candidate that needs a changed constant or function bundles the
// gate through scripts/rhythm-tools/ablatePlugin.ts and puts the loaded step here instead of editing app/.
export const GATE_RULES: Readonly<Record<string, GateRule>> = {
    current: { description: 'the shipped rule (stepBassGate)', step: stepBassGate },
    // Only here to prove that --rule has an effect: the same gate fed a quarter of the bass, so fewer kicks clear its floor.
    'quarter-bass': {
        description: 'the shipped rule fed a quarter of the bass (proves the flag has an effect)',
        step: (bass, rhythm, locked, state, dt) => stepBassGate(bass * 0.25, rhythm, locked, state, dt),
    },
};

export function findGateRule(name: string): GateRule {
    if (!Object.hasOwn(GATE_RULES, name)) {
        throw new Error(`Unknown rule "${name}". Known rules: ${Object.keys(GATE_RULES).join(', ')}`);
    }
    return GATE_RULES[name];
}

export interface GateReplay {
    // Time of the first row where the replayed gate is open, undefined if it never opens.
    firstOpen: number | undefined;
    // Time of the first row with the tempo locked.
    firstLock: number | undefined;
    // firstOpen - firstLock, when both exist.
    delayAfterLock: number | undefined;
    // Share of rows from the first opening on where the gate is open; 0 when it never opens.
    openShare: number;
}

export interface GateColumns {
    // The probe name before ".in" (for example "dancing-character"), for printing which recording column fed the gate.
    probe: string;
    t: number;
    dt: number;
    input: number;
    beatPhase: number;
    tempoLocked: number;
    beatCount: number;
    songChanges: number;
    gateOpen: number;
    // The hub's low end before the bump envelope; -1 in recordings made before the column existed.
    lowEnd: number;
    // The hub's gate-input bass (what the gate hears since S4); -1 in recordings made before the column existed.
    gateBass: number;
    // The tracker's tempo (state.bpm), which places the kicks heard before the lock (S5); -1 in recordings without it.
    bpm: number;
}

// The probe prefix is whatever precedes ".in", so any probe's recording replays.
export function findGateColumns(columns: readonly string[]): GateColumns {
    const prefixed = columns.find((name) => name.endsWith('.in'));
    if (prefixed === undefined) throw new Error('No "<probe>.in" column: not a gate recording');
    const prefix = prefixed.slice(0, -'in'.length);
    const at = (name: string, required: boolean): number => {
        const index = columns.indexOf(name);
        if (index < 0 && required) throw new Error(`Missing column "${name}"`);
        return index;
    };
    return {
        probe: prefixed.slice(0, -'.in'.length),
        t: at('t', true),
        dt: at('dt', false),
        input: at(prefixed, true),
        beatPhase: at(`${prefix}beatPhase`, true),
        tempoLocked: at(`${prefix}tempoLocked`, true),
        beatCount: at(`${prefix}beatCount`, true),
        songChanges: at(`${prefix}songChanges`, true),
        gateOpen: at(`${prefix}gateOpen`, false),
        lowEnd: at(`${prefix}lowEnd`, false),
        gateBass: at(`${prefix}gateBass`, false),
        bpm: at(`${prefix}bpm`, false),
    };
}

// How far ahead the tempo is read off the beat clock for a recording without a bpm column.
const TEMPO_SPAN_SECONDS = 0.5;

// The tempo at each row: the recorded bpm column, or for older recordings the rate the beat clock (beatCount plus
// beatPhase) advances at over the next half second, while it runs without a song change. The gate needs the tempo on
// the very row the lock arrives, which is why this looks ahead; a recording has every row already. 0 where unknown.
export function tempoPerRow(table: TelemetryTable, c: GateColumns): Float64Array {
    const tempo = new Float64Array(table.rows.length);
    if (c.bpm >= 0) {
        table.rows.forEach((row, i) => (tempo[i] = Number.isFinite(row[c.bpm]) ? row[c.bpm] : 0));
        return tempo;
    }
    const position = (row: readonly number[]): number => row[c.beatCount] + row[c.beatPhase];
    let ahead = 0;
    for (let i = 0; i < table.rows.length; i++) {
        const row = table.rows[i];
        if (Number.isNaN(row[c.beatPhase])) continue;
        ahead = Math.max(ahead, i);
        while (ahead + 1 < table.rows.length && table.rows[ahead][c.t] - row[c.t] < TEMPO_SPAN_SECONDS) ahead++;
        const later = table.rows[ahead];
        const span = later[c.t] - row[c.t];
        if (span <= 0 || Number.isNaN(later[c.beatPhase]) || later[c.songChanges] !== row[c.songChanges]) continue;
        tempo[i] = ((position(later) - position(row)) / span) * 60;
    }
    return tempo;
}

// Which recorded column feeds the BassBump: the low end before S4 (the default), or the gate-input bass since S4.
export type BumpInput = 'lowEnd' | 'gateBass';

export interface BumpOptions {
    margin: number;
    gain: number;
    input?: BumpInput;
}

// The BassBump the replay steps: the shipped GATE_BASS_BUMP settings for gateBass, else a plain margin and gain.
function createEnvelope(bump: BumpOptions): BassBump {
    if (bump.input === 'gateBass') return new BassBump({ ...GATE_BASS_BUMP, margin: bump.margin, gain: bump.gain });
    return new BassBump({ margin: bump.margin, gain: bump.gain });
}

// With `bump`, the gate's input is the chosen recorded column stepped through a fresh BassBump instead of the recorded `in`.
export function replayGate(table: TelemetryTable, rule: GateRule, bump?: BumpOptions): GateReplay {
    const c = findGateColumns(table.columns);
    const source = bump?.input === 'gateBass' ? 'gateBass' : 'lowEnd';
    const column = c[source];
    if (bump !== undefined && column < 0) {
        const prefix = table.columns[c.input].slice(0, -'in'.length);
        throw new Error(`Missing column "${prefix}${source}": record with a newer build to replay through BassBump`);
    }
    const envelope = bump === undefined ? undefined : createEnvelope(bump);
    const state = createBassGateState();
    // Only these four fields are read by the gate.
    const rhythm = { beatPhase: undefined as number | undefined, beatCount: 0, songChangeCount: 0, bpm: 0 };
    const tempo = tempoPerRow(table, c);
    let rowIndex = 0;
    let firstOpen: number | undefined;
    let firstLock: number | undefined;
    let rowsOpen = 0;
    let rowsSinceOpen = 0;
    let previousT = NaN;
    for (const row of table.rows) {
        const locked = row[c.tempoLocked] > 0.5;
        if (locked && firstLock === undefined) firstLock = row[c.t];
        const phase = row[c.beatPhase];
        rhythm.beatPhase = Number.isNaN(phase) ? undefined : phase;
        rhythm.beatCount = row[c.beatCount];
        rhythm.songChangeCount = row[c.songChanges];
        rhythm.bpm = tempo[rowIndex++];
        // The recorded dt is rounded to four digits; the time step is the fallback when the column is absent.
        const dt = c.dt >= 0 ? row[c.dt] : row[c.t] - previousT;
        previousT = row[c.t];
        const step = Number.isFinite(dt) ? dt : 0;
        const input = envelope === undefined ? row[c.input] : envelope.step(row[column], step);
        rule.step(input, rhythm as RhythmState, locked, state, step);
        if (state.open && firstOpen === undefined) firstOpen = row[c.t];
        if (firstOpen !== undefined) {
            rowsSinceOpen++;
            if (state.open) rowsOpen++;
        }
    }
    return {
        firstOpen,
        firstLock,
        delayAfterLock: firstOpen !== undefined && firstLock !== undefined ? firstOpen - firstLock : undefined,
        openShare: rowsSinceOpen === 0 ? 0 : rowsOpen / rowsSinceOpen,
    };
}

// The first time the recording's own gateOpen column is 1, to compare against.
export function recordedOpening(table: TelemetryTable): number | undefined {
    const c = findGateColumns(table.columns);
    if (c.gateOpen < 0) return undefined;
    return table.rows.find((row) => row[c.gateOpen] > 0.5)?.[c.t];
}

function seconds(value: number | undefined): string {
    return value === undefined ? 'never' : `${Number(value.toFixed(3))} s`;
}

export function formatGateReplay(
    rule: string,
    replay: GateReplay,
    recorded: number | undefined,
    probe: string,
    bump?: BumpOptions,
): string[] {
    const input =
        bump === undefined
            ? `input: ${probe}.in as recorded`
            : `input: ${probe}.${bump.input ?? 'lowEnd'} through BassBump margin ${bump.margin} gain ${bump.gain}`;
    return [
        `rule ${rule}`,
        input,
        `first open: ${seconds(replay.firstOpen)}`,
        `first lock: ${seconds(replay.firstLock)}`,
        `delay after lock: ${seconds(replay.delayAfterLock)}`,
        `open share: ${Number((replay.openShare * 100).toFixed(2))}% of the time since it first opened`,
        `recorded first open: ${seconds(recorded)}`,
    ];
}
