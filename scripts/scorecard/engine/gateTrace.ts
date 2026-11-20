import type { BassGateState } from '../../../app/features/rhythm/bassGate';
import { createRhythmState, type RhythmState } from '../../../app/features/rhythm/types';
import { RENDER_HZ } from './replay';

// What the dancer's bass gate reads, recorded once per render tick of a replay, so the gate rule alone can be stepped
// again (with other constants) without replaying the tracker, the hub and the bump envelope. The gate (bassGate.ts,
// stepBassGate) reads exactly these: the bass value it is passed (the hub's gateBass pulse after the bump envelope),
// rhythm.beatPhase (which may be undefined), rhythm.beatCount, rhythm.songChangeCount, rhythm.bpm, tempoLocked, and dt,
// which is always the render tick. Nothing else of the rhythm state reaches it.

// Receives one call per render tick from replayPcm, for the shipped gateBass gate.
export interface GateTraceSink {
    tick(
        bass: number,
        beatPhase: number | undefined,
        beatCount: number,
        songChangeCount: number,
        tempoLocked: boolean,
        bpm: number,
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
    public bpm = new Float64Array(0);

    public constructor(capacity = 1024) {
        this.grow(capacity);
    }

    public tick(
        bass: number,
        beatPhase: number | undefined,
        beatCount: number,
        songChangeCount: number,
        tempoLocked: boolean,
        bpm: number,
    ): void {
        if (this.length === this.bass.length) this.grow(Math.max(1024, this.length * 2));
        const i = this.length++;
        this.bass[i] = bass;
        this.beatPhase[i] = beatPhase ?? NaN;
        this.beatCount[i] = beatCount;
        this.songChangeCount[i] = songChangeCount;
        this.tempoLocked[i] = tempoLocked ? 1 : 0;
        this.bpm[i] = bpm;
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
        this.bpm = widen(this.bpm);
    }
}

// Steps a gate over the whole trace and returns the render times at which it started a bump (bumpCount rose): where in
// the beat the dancer's bass pulse lands, which the opening time alone does not show.
export function bumpTimes(trace: GateTrace, stepper: GateStepper): number[] {
    const state = stepper.createBassGateState();
    const rhythm = createRhythmState();
    const dt = 1 / RENDER_HZ;
    const times: number[] = [];
    let bumps = 0;
    for (let i = 0; i < trace.length; i++) {
        const phase = trace.beatPhase[i];
        rhythm.beatPhase = Number.isNaN(phase) ? undefined : phase;
        rhythm.beatCount = trace.beatCount[i];
        rhythm.songChangeCount = trace.songChangeCount[i];
        rhythm.bpm = trace.bpm[i];
        stepper.stepBassGate(trace.bass[i], rhythm, trace.tempoLocked[i] === 1, state, dt);
        if (state.bumpCount > bumps) times.push(i * dt);
        bumps = state.bumpCount;
    }
    return times;
}

// Where bumps land against the labelled beats: the share that hits a beat by the live hit-share window (liveFireHitsBeat
// in targets.ts, applied to the bump's start rather than a reaction crossing, so it reads a few ms early) and the median
// signed distance to the nearest beat in ms. Null without bumps or beats.
export function bumpsOnBeat(
    bumps: readonly number[],
    beats: readonly number[],
    hits: (fire: number, beat: number) => boolean,
): { share: number; medianMs: number } | null {
    if (bumps.length === 0 || beats.length === 0) return null;
    let hit = 0;
    const offsets: number[] = [];
    let j = 0;
    for (const bump of bumps) {
        while (j + 1 < beats.length && Math.abs(beats[j + 1] - bump) <= Math.abs(beats[j] - bump)) j++;
        offsets.push((bump - beats[j]) * 1000);
        if (hits(bump, beats[j]) || (j + 1 < beats.length && hits(bump, beats[j + 1]))) hit++;
    }
    offsets.sort((a, b) => a - b);
    return { share: hit / bumps.length, medianMs: offsets[Math.floor(offsets.length / 2)] };
}

// Steps a gate over the trace the way the replay stepped it, and returns the time of the first render tick at which it is
// open (the replay's `gate.firstOpenSeconds`), or null if it never opens. It stops at the first opening because that is
// all the replay reports.
// `lockAtSeconds` hides the beat clock before that time (no phase, not locked), as if the tracker locked only then. The
// random bass is replayed on a clock locked from the start, which never exercises what the gate does before a lock;
// this is how a sweep measures that on the same patterns.
export function firstOpenSeconds(trace: GateTrace, stepper: GateStepper, lockAtSeconds = 0): number | null {
    const state = stepper.createBassGateState();
    const rhythm = createRhythmState();
    const dt = 1 / RENDER_HZ;
    for (let i = 0; i < trace.length; i++) {
        const phase = trace.beatPhase[i];
        const hidden = i * dt < lockAtSeconds;
        rhythm.beatPhase = hidden || Number.isNaN(phase) ? undefined : phase;
        rhythm.bpm = trace.bpm[i];
        rhythm.beatCount = trace.beatCount[i];
        rhythm.songChangeCount = trace.songChangeCount[i];
        stepper.stepBassGate(trace.bass[i], rhythm, !hidden && trace.tempoLocked[i] === 1, state, dt);
        // The same expression as the replay's render time, so the two agree to the last bit.
        if (state.open) return i * dt;
    }
    return null;
}
