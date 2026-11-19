import type { BassGateState } from '../../../app/features/rhythm/bassGate';
import { createRhythmState, type RhythmState } from '../../../app/features/rhythm/types';
import { RENDER_HZ } from './replay';

// What the dancer's bass gate reads, recorded once per render tick of a replay, so the gate rule alone can be stepped
// again (with other constants) without replaying the tracker, the hub and the bump envelope. The gate (bassGate.ts,
// stepBassGate) reads exactly these: the bass value it is passed (the hub's gateBass pulse after the bump envelope),
// rhythm.beatPhase (which may be undefined), rhythm.beatCount, rhythm.songChangeCount, tempoLocked, and dt, which is
// always the render tick. Nothing else of the rhythm state reaches it.

// Receives one call per render tick from replayPcm, for the shipped gateBass gate.
export interface GateTraceSink {
    tick(
        bass: number,
        beatPhase: number | undefined,
        beatCount: number,
        songChangeCount: number,
        tempoLocked: boolean,
    ): void;
}

// The two exports of bassGate.ts a trace is stepped with; the shipped module or a bundle of it with constants overridden.
export interface GateStepper {
    createBassGateState: () => BassGateState;
    stepBassGate: (
        bass: number,
        rhythm: Readonly<RhythmState>,
        tempoLocked: boolean,
        state: BassGateState,
        dt: number,
    ) => number;
}

// Typed arrays, grown by doubling because the replay does not announce how many ticks it will run: 400 beats at 60 Hz is
// 12000 ticks and a sweep keeps one trace per pattern in flight at most, so memory stays small. Doubles for the bass and
// the phase, because the gate must see exactly the values the replay did to give exactly its openings.
export class GateTrace implements GateTraceSink {
    public length = 0;
    public bass = new Float64Array(0);
    // NaN stands for an undefined beat phase.
    public beatPhase = new Float64Array(0);
    public beatCount = new Int32Array(0);
    public songChangeCount = new Int32Array(0);
    public tempoLocked = new Uint8Array(0);

    public constructor(capacity = 1024) {
        this.grow(capacity);
    }

    public tick(
        bass: number,
        beatPhase: number | undefined,
        beatCount: number,
        songChangeCount: number,
        tempoLocked: boolean,
    ): void {
        if (this.length === this.bass.length) this.grow(Math.max(1024, this.length * 2));
        const i = this.length++;
        this.bass[i] = bass;
        this.beatPhase[i] = beatPhase ?? NaN;
        this.beatCount[i] = beatCount;
        this.songChangeCount[i] = songChangeCount;
        this.tempoLocked[i] = tempoLocked ? 1 : 0;
    }

    private grow(capacity: number): void {
        const widen = <T extends Float64Array | Int32Array | Uint8Array>(old: T): T => {
            const wider = new (old.constructor as new (length: number) => T)(capacity);
            wider.set(old);
            return wider;
        };
        this.bass = widen(this.bass);
        this.beatPhase = widen(this.beatPhase);
        this.beatCount = widen(this.beatCount);
        this.songChangeCount = widen(this.songChangeCount);
        this.tempoLocked = widen(this.tempoLocked);
    }
}

// Steps a gate over the trace the way the replay stepped it, and returns the time of the first render tick at which it is
// open (the replay's `gate.firstOpenSeconds`), or null if it never opens. It stops at the first opening because that is
// all the replay reports.
export function firstOpenSeconds(trace: GateTrace, stepper: GateStepper): number | null {
    const state = stepper.createBassGateState();
    const rhythm = createRhythmState();
    const dt = 1 / RENDER_HZ;
    for (let i = 0; i < trace.length; i++) {
        const phase = trace.beatPhase[i];
        rhythm.beatPhase = Number.isNaN(phase) ? undefined : phase;
        rhythm.beatCount = trace.beatCount[i];
        rhythm.songChangeCount = trace.songChangeCount[i];
        stepper.stepBassGate(trace.bass[i], rhythm, trace.tempoLocked[i] === 1, state, dt);
        // The same expression as the replay's render time, so the two agree to the last bit.
        if (state.open) return i * dt;
    }
    return null;
}
