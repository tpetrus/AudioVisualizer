import { BassBump } from '../../app/features/audio/hub/bassBump';
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
    };
}

export interface BumpOptions {
    margin: number;
    gain: number;
}

// With `bump`, the gate's input is the recorded low end stepped through a fresh BassBump instead of the recorded `in`.
export function replayGate(table: TelemetryTable, rule: GateRule, bump?: BumpOptions): GateReplay {
    const c = findGateColumns(table.columns);
    if (bump !== undefined && c.lowEnd < 0) {
        const prefix = table.columns[c.input].slice(0, -'in'.length);
        throw new Error(`Missing column "${prefix}lowEnd": record with a newer build to replay through BassBump`);
    }
    const envelope = bump === undefined ? undefined : new BassBump(bump);
    const state = createBassGateState();
    // Only these three fields are read by the gate.
    const rhythm = { beatPhase: undefined as number | undefined, beatCount: 0, songChangeCount: 0 };
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
        // The recorded dt is rounded to four digits; the time step is the fallback when the column is absent.
        const dt = c.dt >= 0 ? row[c.dt] : row[c.t] - previousT;
        previousT = row[c.t];
        const step = Number.isFinite(dt) ? dt : 0;
        const input = envelope === undefined ? row[c.input] : envelope.step(row[c.lowEnd], step);
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
    bump?: { margin: number; gain: number },
): string[] {
    const input =
        bump === undefined
            ? `input: ${probe}.in as recorded`
            : `input: ${probe}.lowEnd through BassBump margin ${bump.margin} gain ${bump.gain}`;
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
