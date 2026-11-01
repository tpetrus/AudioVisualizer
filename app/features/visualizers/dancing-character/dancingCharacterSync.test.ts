import { describe, expect, it } from 'vitest';
import { TEMPO_LOCK_CONFIDENCE, TEMPO_LOSE_CONFIDENCE } from '~/features/rhythm/rhythmConfig';
import {
    DANCE_CLIP_DURATION,
    DEFAULT_CALM_RATE,
    MAX_PHASE_NUDGE_PER_SECOND,
    MAX_TIME_SCALE_CHANGE_PER_SECOND,
    MIN_TIME_SCALE,
    NATIVE_BEATS_PER_LOOP,
    NATIVE_BPM,
} from './dancingCharacterConfig';
import {
    computeDanceTiming,
    createDanceTimingState,
    snapStepMultiple,
    type DanceTimingInput,
    type DanceTimingOutput,
    type DanceTimingState,
} from './dancingCharacterSync';

const DT = 1 / 60;

function makeInput(overrides: Partial<DanceTimingInput> = {}): DanceTimingInput {
    return {
        bpm: 120,
        tempoConfidence: 0.6,
        beatPhase: 0,
        songChangeCount: 0,
        clipPhase: 0,
        danceSpeed: 1,
        dt: DT,
        ...overrides,
    };
}

function makeOutput(): DanceTimingOutput {
    return { timeScale: 0, phaseNudge: 0, normalizedBpm: undefined };
}

function wrapSigned(delta: number): number {
    return delta - Math.round(delta);
}

// Plays the part of the tracker and the animation mixer for `seconds`: the beat phase advances at the music's tempo,
// and the clip advances by timeScale and the nudge, exactly as the scene applies them.
function simulate(options: {
    bpm: number;
    seconds: number;
    danceSpeed?: number;
    startClipPhase?: number;
    state?: DanceTimingState;
}): { state: DanceTimingState; out: DanceTimingOutput; clipPhase: number; beatPhase: number; maxNudgeRatio: number } {
    const state = options.state ?? createDanceTimingState();
    const out = makeOutput();
    let clipPhase = options.startClipPhase ?? 0;
    let beatPhase = 0;
    let maxNudgeRatio = 0;
    for (let i = 0; i < options.seconds / DT; i++) {
        computeDanceTiming(
            makeInput({ bpm: options.bpm, beatPhase, clipPhase, danceSpeed: options.danceSpeed ?? 1 }),
            state,
            out,
        );
        maxNudgeRatio = Math.max(maxNudgeRatio, Math.abs(out.phaseNudge) / (MAX_PHASE_NUDGE_PER_SECOND * DT));
        clipPhase = (clipPhase + (out.timeScale * DT) / DANCE_CLIP_DURATION + out.phaseNudge + 1) % 1;
        beatPhase = (beatPhase + (options.bpm / 60) * DT) % 1;
    }
    return { state, out, clipPhase, beatPhase, maxNudgeRatio };
}

describe('snapStepMultiple', () => {
    it('snaps to the nearest of 0.5, 1 and 2', () => {
        expect(snapStepMultiple(0.5)).toBe(0.5);
        expect(snapStepMultiple(0.6)).toBe(0.5);
        expect(snapStepMultiple(1)).toBe(1);
        expect(snapStepMultiple(1.25)).toBe(1);
        expect(snapStepMultiple(1.5)).toBe(2);
        expect(snapStepMultiple(2)).toBe(2);
        expect(snapStepMultiple(5)).toBe(2);
    });

    it('never fails on a zero or negative setting', () => {
        expect(snapStepMultiple(0)).toBe(0.5);
        expect(snapStepMultiple(-1)).toBe(0.5);
    });
});

describe('computeDanceTiming', () => {
    it('writes into and returns the given output object', () => {
        const out = makeOutput();
        expect(computeDanceTiming(makeInput(), createDanceTimingState(), out)).toBe(out);
    });

    it.each([0.5, 1, 2])('converges the time scale to (bpm / native) * multiple at danceSpeed %s', (danceSpeed) => {
        const { out } = simulate({ bpm: 120, seconds: 6, danceSpeed });
        expect(out.timeScale).toBeCloseTo((120 / NATIVE_BPM) * danceSpeed, 2);
        expect(out.normalizedBpm).toBeCloseTo(120, 6);
    });

    it.each([
        [100, 1, 0.3],
        [128, 1, 0.9],
        [144, 2, 0.45],
        [90, 0.5, 0.2],
    ])('converges the clip beat slot to the beat phase at %s BPM, multiple %s', (bpm, multiple, start) => {
        const { clipPhase, beatPhase, maxNudgeRatio } = simulate({
            bpm,
            seconds: 25,
            danceSpeed: multiple,
            startClipPhase: start,
        });
        const beatsPerLoop = NATIVE_BEATS_PER_LOOP / multiple;
        expect(Math.abs(wrapSigned(beatPhase - clipPhase * beatsPerLoop))).toBeLessThan(0.02);
        // The correction is bounded per frame, so the catch-up is a speed change rather than a jump.
        expect(maxNudgeRatio).toBeLessThanOrEqual(1 + 1e-9);
    });

    it('wraps the phase error across 0 and 1 the short way', () => {
        const ahead = computeDanceTiming(
            makeInput({ beatPhase: 0.05, clipPhase: 0.95 / NATIVE_BEATS_PER_LOOP, dt: 0.1 }),
            createDanceTimingState(),
            makeOutput(),
        );
        // The clip slot is at 0.95 and the beat at 0.05: the clip is 0.1 of a beat behind, so it is pushed forward.
        expect(ahead.phaseNudge).toBeCloseTo((0.1 * 3 * 0.1) / NATIVE_BEATS_PER_LOOP, 6);

        const behind = computeDanceTiming(
            makeInput({ beatPhase: 0.95, clipPhase: 0.05 / NATIVE_BEATS_PER_LOOP, dt: 0.1 }),
            createDanceTimingState(),
            makeOutput(),
        );
        expect(behind.phaseNudge).toBeCloseTo(-ahead.phaseNudge, 6);
    });

    it('treats an error of exactly half a beat as positive', () => {
        const half = computeDanceTiming(
            makeInput({ beatPhase: 0.5, clipPhase: 0 }),
            createDanceTimingState(),
            makeOutput(),
        );
        expect(half.phaseNudge).toBeGreaterThan(0);
    });

    it('clamps the nudge to the per-second limit', () => {
        const out = computeDanceTiming(makeInput({ beatPhase: 0.5, dt: 0.1 }), createDanceTimingState(), makeOutput());
        expect(out.phaseNudge).toBeCloseTo(MAX_PHASE_NUDGE_PER_SECOND * 0.1, 10);
        const negative = computeDanceTiming(
            makeInput({ beatPhase: 0.4, clipPhase: 0.85 / NATIVE_BEATS_PER_LOOP, dt: 0.1 }),
            createDanceTimingState(),
            makeOutput(),
        );
        expect(negative.phaseNudge).toBeCloseTo(-MAX_PHASE_NUDGE_PER_SECOND * 0.1, 10);
    });

    it('gives no nudge for a zero frame step', () => {
        const out = computeDanceTiming(makeInput({ beatPhase: 0.4, dt: 0 }), createDanceTimingState(), makeOutput());
        expect(out.phaseNudge).toBeCloseTo(0, 12);
    });

    it('treats a frame step above 0.1 s as 0.1 s', () => {
        const long = computeDanceTiming(makeInput({ beatPhase: 0.4, dt: 5 }), createDanceTimingState(), makeOutput());
        const capped = computeDanceTiming(
            makeInput({ beatPhase: 0.4, dt: 0.1 }),
            createDanceTimingState(),
            makeOutput(),
        );
        expect(long).toEqual(capped);
        const negative = computeDanceTiming(
            makeInput({ beatPhase: 0.4, dt: -1 }),
            createDanceTimingState(),
            makeOutput(),
        );
        expect(negative.timeScale).toBeCloseTo(DEFAULT_CALM_RATE, 12);
    });

    describe('lock hysteresis', () => {
        const mid = (TEMPO_LOCK_CONFIDENCE + TEMPO_LOSE_CONFIDENCE) / 2;

        it('stays unlocked between the two thresholds, and locks at the upper one', () => {
            const state = createDanceTimingState();
            const out = makeOutput();
            computeDanceTiming(makeInput({ tempoConfidence: mid }), state, out);
            expect(out.normalizedBpm).toBeUndefined();
            computeDanceTiming(makeInput({ tempoConfidence: TEMPO_LOCK_CONFIDENCE }), state, out);
            expect(out.normalizedBpm).toBe(120);
        });

        it('stays locked between the two thresholds, and releases below the lower one', () => {
            const state = createDanceTimingState();
            const out = makeOutput();
            computeDanceTiming(makeInput({ tempoConfidence: 0.5 }), state, out);
            computeDanceTiming(makeInput({ tempoConfidence: mid }), state, out);
            expect(out.normalizedBpm).toBe(120);
            computeDanceTiming(makeInput({ tempoConfidence: TEMPO_LOSE_CONFIDENCE }), state, out);
            expect(out.normalizedBpm).toBe(120);
            computeDanceTiming(makeInput({ tempoConfidence: TEMPO_LOSE_CONFIDENCE - 0.01 }), state, out);
            expect(out.normalizedBpm).toBeUndefined();
            // Back between the thresholds it does not re-lock on its own.
            computeDanceTiming(makeInput({ tempoConfidence: mid }), state, out);
            expect(out.normalizedBpm).toBeUndefined();
        });

        it('needs a known tempo and a beat phase to lock, and loses the lock without them', () => {
            const state = createDanceTimingState();
            const out = makeOutput();
            computeDanceTiming(makeInput({ bpm: 0 }), state, out);
            expect(out.normalizedBpm).toBeUndefined();
            computeDanceTiming(makeInput({ beatPhase: undefined }), state, out);
            expect(out.normalizedBpm).toBeUndefined();

            computeDanceTiming(makeInput(), state, out);
            expect(out.normalizedBpm).toBe(120);
            computeDanceTiming(makeInput({ beatPhase: undefined }), state, out);
            expect(out.normalizedBpm).toBeUndefined();
            computeDanceTiming(makeInput(), state, out);
            computeDanceTiming(makeInput({ bpm: 0 }), state, out);
            expect(out.normalizedBpm).toBeUndefined();
        });
    });

    describe('octave normalization', () => {
        it('folds the first tempo into 80..160', () => {
            const fold = (bpm: number) =>
                computeDanceTiming(makeInput({ bpm }), createDanceTimingState(), makeOutput()).normalizedBpm;
            expect(fold(60)).toBeCloseTo(120, 9);
            expect(fold(80)).toBeCloseTo(80, 9);
            expect(fold(159)).toBeCloseTo(159, 9);
            expect(fold(200)).toBeCloseTo(100, 9);
            expect(fold(300)).toBeCloseTo(150, 9);
            expect(fold(40)).toBeCloseTo(160 / 2, 9);
        });

        it('gives the same tempo and no time scale jump when the estimate doubles or halves mid-song', () => {
            const state = createDanceTimingState();
            const out = makeOutput();
            for (let i = 0; i < 200; i++) computeDanceTiming(makeInput({ bpm: 100 }), state, out);
            const settled = out.timeScale;
            for (const bpm of [200, 100, 50, 100, 400, 25]) {
                computeDanceTiming(makeInput({ bpm }), state, out);
                expect(out.normalizedBpm).toBeCloseTo(100, 9);
                expect(Math.abs(out.timeScale - settled)).toBeLessThanOrEqual(MAX_TIME_SCALE_CHANGE_PER_SECOND * DT);
            }
        });

        it('follows a gradual tempo change out of the starting range instead of snapping back', () => {
            const state = createDanceTimingState();
            const out = makeOutput();
            for (let bpm = 150; bpm <= 175; bpm += 5) computeDanceTiming(makeInput({ bpm }), state, out);
            expect(out.normalizedBpm).toBeCloseTo(175, 9);
        });
    });

    describe('unknown tempo', () => {
        it('runs at the calm rate times the free dance speed, with no nudge', () => {
            for (const danceSpeed of [0.5, 1, 1.5, 2]) {
                const { out } = simulate({ bpm: 0, seconds: 8, danceSpeed });
                expect(out.timeScale).toBeCloseTo(DEFAULT_CALM_RATE * danceSpeed, 3);
                expect(out.phaseNudge).toBe(0);
                expect(out.normalizedBpm).toBeUndefined();
            }
        });

        it('never reaches a time scale of zero', () => {
            const state = createDanceTimingState();
            const out = makeOutput();
            for (let i = 0; i < 600; i++) {
                computeDanceTiming(makeInput({ bpm: 0, beatPhase: undefined, danceSpeed: 0 }), state, out);
                expect(out.timeScale).toBeGreaterThanOrEqual(MIN_TIME_SCALE);
            }
            expect(out.timeScale).toBeCloseTo(MIN_TIME_SCALE, 6);
        });

        it('eases between the calm rate and the locked rate without jumping', () => {
            const state = createDanceTimingState();
            const out = makeOutput();
            let previous = DEFAULT_CALM_RATE;
            const inputs = [makeInput({ bpm: 0 }), makeInput({ bpm: 170 }), makeInput({ bpm: 0 })];
            for (const input of inputs) {
                for (let i = 0; i < 120; i++) {
                    computeDanceTiming(input, state, out);
                    expect(Math.abs(out.timeScale - previous)).toBeLessThanOrEqual(
                        MAX_TIME_SCALE_CHANGE_PER_SECOND * DT + 1e-12,
                    );
                    previous = out.timeScale;
                }
            }
        });
    });

    describe('song changes', () => {
        it('releases the lock and the octave memory, keeps the time scale, and re-syncs once confident again', () => {
            const state = createDanceTimingState();
            const out = makeOutput();
            for (let i = 0; i < 300; i++) computeDanceTiming(makeInput({ bpm: 159 }), state, out);
            const before = out.timeScale;
            expect(before).toBeCloseTo(159 / NATIVE_BPM, 2);

            // The tracker reports no tempo right after a song change.
            computeDanceTiming(makeInput({ bpm: 0, beatPhase: undefined, songChangeCount: 1 }), state, out);
            expect(out.normalizedBpm).toBeUndefined();
            expect(Math.abs(out.timeScale - before)).toBeLessThanOrEqual(MAX_TIME_SCALE_CHANGE_PER_SECOND * DT);

            // The new song is confident at half the old tempo; without the reset the octave memory would pick 160.
            computeDanceTiming(makeInput({ bpm: 80, songChangeCount: 1 }), state, out);
            expect(out.normalizedBpm).toBeCloseTo(80, 9);
        });

        it('does not lock again when the change arrives with an unconfident tempo', () => {
            const state = createDanceTimingState();
            const out = makeOutput();
            computeDanceTiming(makeInput(), state, out);
            expect(out.normalizedBpm).toBe(120);
            computeDanceTiming(makeInput({ songChangeCount: 1, tempoConfidence: 0.1 }), state, out);
            expect(out.normalizedBpm).toBeUndefined();
        });

        it('does not treat the first reading as a song change', () => {
            const state = createDanceTimingState();
            const out = makeOutput();
            computeDanceTiming(makeInput({ songChangeCount: 7 }), state, out);
            expect(out.normalizedBpm).toBe(120);
            computeDanceTiming(makeInput({ songChangeCount: 7 }), state, out);
            expect(out.normalizedBpm).toBe(120);
        });
    });
});
