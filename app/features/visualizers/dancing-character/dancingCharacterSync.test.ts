import { describe, expect, it } from 'vitest';
import {
    METER_ENTER_CONFIDENCE,
    METER_EXIT_CONFIDENCE,
    TEMPO_LOCK_CONFIDENCE,
    TEMPO_LOSE_CONFIDENCE,
} from '~/features/rhythm/rhythmConfig';
import { createRhythmState, type RhythmState } from '~/features/rhythm/types';
import {
    CALM_DANCE_WEIGHT,
    CALM_TIME_SCALE,
    DANCE_CLIP_DURATION,
    DANCE_WEIGHT_RATE,
    MAX_PHASE_NUDGE_PER_SECOND,
    MAX_TIME_SCALE_CHANGE_PER_SECOND,
    MIN_TIME_SCALE,
    NATIVE_BEATS_PER_LOOP,
    MAX_DANCE_BPM,
    MAX_DANCE_BPM_RELEASE,
    NATIVE_BPM,
    NORMALIZED_BPM_MIN,
    STEP_MULTIPLES,
} from './dancingCharacterConfig';
import {
    computeDanceTiming,
    createDanceTimingResult,
    createDanceTimingState,
    snapStepMultiple,
    type DanceTimingResult,
    type DanceTimingState,
} from './dancingCharacterSync';

const DT = 1 / 60;
const CLIP_BEATS = NATIVE_BEATS_PER_LOOP;

interface RhythmOverrides {
    bpm?: number;
    tempoConfidence?: number;
    beatPhase?: number | undefined;
    barPhase?: number | undefined;
    beatsPerBar?: 3 | 4 | undefined;
    meterConfidence?: number;
    songChangeCount?: number;
}

// A confident 4/4 reading by default; `'beatPhase' in overrides` lets a test pass undefined on purpose.
function makeRhythm(overrides: RhythmOverrides = {}): RhythmState {
    const rhythm = createRhythmState();
    rhythm.bpm = 120;
    rhythm.tempoConfidence = 0.6;
    rhythm.beatPhase = 0;
    rhythm.barPhase = 0;
    rhythm.beatsPerBar = 4;
    rhythm.meterConfidence = 0.8;
    Object.assign(rhythm, overrides);
    return rhythm;
}

function step(
    rhythm: RhythmState,
    state: DanceTimingState,
    out: DanceTimingResult,
    options: { clipPhase?: number; danceSpeed?: number; dt?: number; clipBeats?: number } = {},
): DanceTimingResult {
    return computeDanceTiming(
        rhythm,
        options.clipBeats ?? CLIP_BEATS,
        options.clipPhase ?? 0,
        { danceSpeed: options.danceSpeed ?? 1 },
        state,
        options.dt ?? DT,
        out,
    );
}

function wrapSigned(delta: number): number {
    return delta - Math.round(delta);
}

// Plays the part of the tracker and the animation mixer for `seconds`: beat and bar phase advance at the music's
// tempo, and the clip advances by timeScale and the nudge, exactly as the scene applies them.
function simulate(options: {
    bpm: number;
    seconds: number;
    danceSpeed?: number;
    startClipPhase?: number;
    startBeat?: number;
    rhythm?: RhythmOverrides;
    state?: DanceTimingState;
    out?: DanceTimingResult;
    clipPhase?: number;
    time?: number;
}) {
    const state = options.state ?? createDanceTimingState();
    const out = options.out ?? createDanceTimingResult();
    let clipPhase = options.clipPhase ?? options.startClipPhase ?? 0;
    let time = options.time ?? 0;
    let maxNudgeRatio = 0;
    let advanced = 0;
    const rhythm = makeRhythm({ bpm: options.bpm, ...options.rhythm });
    const keepBar = !options.rhythm || !('barPhase' in options.rhythm);
    const keepBeat = !options.rhythm || !('beatPhase' in options.rhythm);
    for (let i = 0; i < options.seconds / DT; i++) {
        const beats = time * (options.bpm / 60) + (options.startBeat ?? 0);
        if (keepBeat) rhythm.beatPhase = beats - Math.floor(beats);
        if (keepBar) rhythm.barPhase = beats / 4 - Math.floor(beats / 4);
        step(rhythm, state, out, { clipPhase, danceSpeed: options.danceSpeed });
        maxNudgeRatio = Math.max(maxNudgeRatio, Math.abs(out.phaseNudge) / (MAX_PHASE_NUDGE_PER_SECOND * DT));
        const delta = (out.timeScale * DT) / DANCE_CLIP_DURATION + out.phaseNudge;
        clipPhase = (clipPhase + delta + 1) % 1;
        advanced = delta;
        time += DT;
    }
    return { state, out, clipPhase, time, maxNudgeRatio, rhythm, advanced };
}

describe('snapStepMultiple', () => {
    it('snaps to the nearest of 0.5 and 1', () => {
        expect(snapStepMultiple(0.5)).toBe(0.5);
        expect(snapStepMultiple(0.6)).toBe(0.5);
        expect(snapStepMultiple(1)).toBe(1);
        expect(snapStepMultiple(1.25)).toBe(1);
        expect(snapStepMultiple(1.5)).toBe(1);
        expect(snapStepMultiple(2)).toBe(1);
        expect(snapStepMultiple(5)).toBe(1);
    });

    it('never fails on a zero or negative setting', () => {
        expect(snapStepMultiple(0)).toBe(0.5);
        expect(snapStepMultiple(-1)).toBe(0.5);
    });
});

describe('computeDanceTiming', () => {
    it('writes into and returns the given result object without adding fields', () => {
        const out = createDanceTimingResult();
        const keys = Object.keys(out);
        const state = createDanceTimingState();
        const stateKeys = Object.keys(state);
        expect(step(makeRhythm(), state, out)).toBe(out);
        expect(Object.keys(out)).toEqual(keys);
        expect(Object.keys(state)).toEqual(stateKeys);
    });

    it.each([90, 120, 128, 174])('runs one loop in clipBeats x 60 / normalizedBpm at %s BPM', (bpm) => {
        const { out } = simulate({ bpm, seconds: 12 });
        const normalized = out.normalizedBpm ?? 0;
        // 174 folds to 87; the others are already in 80..160.
        expect(normalized).toBeCloseTo(bpm >= 160 ? bpm / 2 : bpm, 6);
        // One loop of the clip takes its native duration divided by the settled time scale. (The beat nudge is left
        // out: at 174 the folded clip runs at half time, so the real beats cannot hold it on one slot.)
        const loopSeconds = DANCE_CLIP_DURATION / out.timeScale;
        expect(loopSeconds).toBeCloseTo((CLIP_BEATS * 60) / normalized, 1);
    });

    it.each([0.5, 1])('converges the time scale to (bpm / native) * multiple at danceSpeed %s', (danceSpeed) => {
        const { out } = simulate({ bpm: 120, seconds: 8, danceSpeed });
        expect(out.timeScale).toBeCloseTo((120 / NATIVE_BPM) * danceSpeed, 2);
    });

    describe('dance speed limit', () => {
        it('steps at half time above the limit and keeps the same tempo reading', () => {
            const { out } = simulate({ bpm: 150, seconds: 10 });
            expect(out.normalizedBpm).toBeCloseTo(150, 6);
            expect(out.timeScale).toBeCloseTo((150 / NATIVE_BPM) * 0.5, 2);
        });

        it.each([135, MAX_DANCE_BPM])('leaves %s BPM at full speed', (bpm) => {
            const { out } = simulate({ bpm, seconds: 10 });
            expect(out.timeScale).toBeCloseTo(bpm / NATIVE_BPM, 2);
        });

        it('stays on the bar at half time, with two bars in one loop', () => {
            const { clipPhase, time, out } = simulate({ bpm: 150, seconds: 25, startClipPhase: 0.3 });
            expect(out.barLocked).toBe(true);
            const bars = (time * (150 / 60)) / 4;
            expect(Math.abs(wrapSigned(bars - clipPhase * 2))).toBeLessThan(0.02);
        });

        it('stays on the beat at half time without a bar, with eight beats in one loop', () => {
            const { clipPhase, time, out } = simulate({
                bpm: 150,
                seconds: 25,
                startClipPhase: 0.3,
                rhythm: { beatsPerBar: undefined, barPhase: undefined },
            });
            expect(out.barLocked).toBe(false);
            const beats = time * (150 / 60);
            expect(Math.abs(wrapSigned(beats - clipPhase * CLIP_BEATS * 2))).toBeLessThan(0.02);
        });

        it('does not flip between half and full time for a tempo at the limit', () => {
            const state = createDanceTimingState();
            const out = createDanceTimingResult();
            simulate({ bpm: MAX_DANCE_BPM + 1, seconds: 4, state, out });
            expect(state.overSpeedLimit).toBe(true);
            simulate({ bpm: MAX_DANCE_BPM - 1, seconds: 4, state, out });
            expect(state.overSpeedLimit).toBe(true);
            expect(out.timeScale).toBeCloseTo(((MAX_DANCE_BPM - 1) / NATIVE_BPM) * 0.5, 2);
            simulate({ bpm: MAX_DANCE_BPM * MAX_DANCE_BPM_RELEASE - 1, seconds: 4, state, out });
            expect(state.overSpeedLimit).toBe(false);
        });

        it('forgets the limit on a new song', () => {
            const state = createDanceTimingState();
            const out = createDanceTimingResult();
            simulate({ bpm: 150, seconds: 4, state, out });
            expect(state.overSpeedLimit).toBe(true);
            step(makeRhythm({ bpm: 100, songChangeCount: 1 }), state, out);
            expect(state.overSpeedLimit).toBe(false);
        });

        it('leaves the half time setting as chosen when it is already under the limit', () => {
            expect(simulate({ bpm: 150, seconds: 10, danceSpeed: 0.5 }).out.timeScale).toBeCloseTo(
                (150 / NATIVE_BPM) * 0.5,
                2,
            );
        });

        // The implied rate is what a person would see: the time scale times the native tempo.
        function impliedBpm(timeScale: number): number {
            return timeScale * NATIVE_BPM;
        }

        // True when `ratio` is a power of two (the steps stay on the beat).
        function isPowerOfTwo(ratio: number): boolean {
            const octaves = Math.log2(ratio);
            return Math.abs(octaves - Math.round(octaves)) < 1e-6;
        }

        // Walks the tempo up in steps small enough for normalizeOctave to follow, as a real climb would, so tempos
        // past 280 are reachable.
        function climbTo(bpm: number, danceSpeed: number, state: DanceTimingState, out: DanceTimingResult): void {
            for (let b = Math.min(bpm, 120); b < bpm; b = Math.min(bpm, b + 5)) {
                step(makeRhythm({ bpm: b }), state, out, { danceSpeed });
            }
        }

        describe('never dances faster than MAX_DANCE_BPM', () => {
            const tempos = [40, 80, 135.8, 140, 141, 159, 175, 281, 400, 1000];
            const settings = [0.5, 1, 2];

            it.each(tempos.flatMap((bpm) => settings.map((danceSpeed) => [bpm, danceSpeed] as const)))(
                'locked at %s BPM, danceSpeed %s',
                (bpm, danceSpeed) => {
                    const state = createDanceTimingState();
                    const out = createDanceTimingResult();
                    climbTo(bpm, danceSpeed, state, out);
                    simulate({ bpm, seconds: 10, danceSpeed, state, out });
                    const normalized = out.normalizedBpm ?? 0;
                    expect(impliedBpm(out.timeScale)).toBeLessThanOrEqual(MAX_DANCE_BPM + 0.5);
                    // On the beat: the target is the tempo times a power of two, never a clamped value.
                    const ratio = out.timeScale / (normalized / NATIVE_BPM);
                    expect(isPowerOfTwo(ratio)).toBe(true);
                    expect(ratio).toBeLessThanOrEqual(1 + 1e-9);
                    // Not slower than it has to be: one more doubling would break the limit or pass the setting.
                    const chosen = snapStepMultiple(danceSpeed);
                    if (ratio < chosen) expect(impliedBpm(out.timeScale * 2)).toBeGreaterThan(MAX_DANCE_BPM * 0.97);
                },
            );

            it('keeps halving for a tempo that climbed past 280', () => {
                const state = createDanceTimingState();
                const out = createDanceTimingResult();
                climbTo(300, 1, state, out);
                simulate({ bpm: 300, seconds: 10, state, out });
                expect(out.normalizedBpm).toBeCloseTo(300, 9);
                expect(out.timeScale).toBeCloseTo((300 / NATIVE_BPM) * 0.25, 2);
            });

            it('applies the same limit to the half time setting', () => {
                const state = createDanceTimingState();
                const out = createDanceTimingResult();
                climbTo(600, 0.5, state, out);
                simulate({ bpm: 600, seconds: 10, danceSpeed: 0.5, state, out });
                expect(out.timeScale).toBeCloseTo((600 / NATIVE_BPM) * 0.125, 2);
            });

            it('stays on the bar through the extra halving', () => {
                const state = createDanceTimingState();
                const out = createDanceTimingResult();
                climbTo(300, 1, state, out);
                const { clipPhase, time } = simulate({ bpm: 300, seconds: 40, startClipPhase: 0.3, state, out });
                expect(out.barLocked).toBe(true);
                // A quarter speed loop holds four bars.
                const bars = (time * (300 / 60)) / 4;
                expect(Math.abs(wrapSigned(bars - clipPhase * 4))).toBeLessThan(0.05);
            });

            it.each(settings.flatMap((danceSpeed) => [0, 90, 200].map((bpm) => [bpm, danceSpeed] as const)))(
                'unlocked (bpm %s), danceSpeed %s',
                (bpm, danceSpeed) => {
                    const { out } = simulate({
                        bpm,
                        seconds: 8,
                        danceSpeed,
                        rhythm: { beatPhase: undefined, tempoConfidence: 0 },
                    });
                    expect(out.normalizedBpm).toBeUndefined();
                    expect(impliedBpm(out.timeScale)).toBeLessThanOrEqual(MAX_DANCE_BPM + 1e-6);
                },
            );

            it('caps a stale setting at the limit while unlocked, and keeps the default calm rate at 1', () => {
                const stale = simulate({ bpm: 0, seconds: 8, danceSpeed: 2, rhythm: { beatPhase: undefined } });
                expect(stale.out.timeScale).toBeCloseTo(MAX_DANCE_BPM / NATIVE_BPM, 3);
                const normal = simulate({ bpm: 0, seconds: 8, rhythm: { beatPhase: undefined } });
                expect(normal.out.timeScale).toBeCloseTo(1, 3);
            });
        });
    });

    describe('octave folding', () => {
        it('folds the first tempo into 80..160', () => {
            const fold = (bpm: number) =>
                step(makeRhythm({ bpm }), createDanceTimingState(), createDanceTimingResult()).normalizedBpm;
            expect(fold(60)).toBeCloseTo(120, 9);
            expect(fold(80)).toBeCloseTo(80, 9);
            expect(fold(159)).toBeCloseTo(159, 9);
            expect(fold(200)).toBeCloseTo(100, 9);
            expect(fold(300)).toBeCloseTo(150, 9);
        });

        it('holds the same tempo and loop speed through a 90 -> 180 flip', () => {
            const state = createDanceTimingState();
            const out = createDanceTimingResult();
            const first = simulate({ bpm: 90, seconds: 10, state, out });
            const settled = out.timeScale;
            // The tracker flips to double time: the beat phase now runs twice as fast.
            const second = simulate({ bpm: 180, seconds: 1, state, out, clipPhase: first.clipPhase, time: first.time });
            expect(out.normalizedBpm).toBeCloseTo(90, 9);
            expect(out.timeScale).toBeCloseTo(settled, 2);
            expect(second.out.barLocked).toBe(true);
        });

        it('gives no time scale jump when the estimate doubles or halves mid-song', () => {
            const state = createDanceTimingState();
            const out = createDanceTimingResult();
            for (let i = 0; i < 200; i++) step(makeRhythm({ bpm: 100 }), state, out);
            const settled = out.timeScale;
            for (const bpm of [200, 100, 50, 100, 400, 25]) {
                step(makeRhythm({ bpm }), state, out);
                expect(out.normalizedBpm).toBeCloseTo(100, 9);
                expect(Math.abs(out.timeScale - settled)).toBeLessThanOrEqual(MAX_TIME_SCALE_CHANGE_PER_SECOND * DT);
            }
        });

        it('follows a gradual tempo change out of the starting range instead of snapping back', () => {
            const state = createDanceTimingState();
            const out = createDanceTimingResult();
            for (let bpm = 150; bpm <= 175; bpm += 5) step(makeRhythm({ bpm }), state, out);
            expect(out.normalizedBpm).toBeCloseTo(175, 9);
        });
    });

    describe('bar lock', () => {
        it.each([
            [120, 0.3, 1],
            [100, 0.8, 1],
            [90, 0.1, 0.5],
        ])('converges the loop start to the bar phase at %s BPM from %s, multiple %s', (bpm, start, multiple) => {
            const { out, clipPhase, time, maxNudgeRatio } = simulate({
                bpm,
                seconds: 30,
                danceSpeed: multiple,
                startClipPhase: start,
            });
            expect(out.barLocked).toBe(true);
            const barsPerLoop = CLIP_BEATS / (4 * multiple);
            const beats = time * (bpm / 60);
            const barPhase = beats / 4 - Math.floor(beats / 4);
            const error = wrapSigned(barPhase - clipPhase * barsPerLoop);
            expect(Math.abs(error)).toBeLessThan(0.02);
            // The correction is bounded per frame, so the catch-up is a speed change rather than a jump.
            expect(maxNudgeRatio).toBeLessThanOrEqual(1 + 1e-9);
        });

        it('compares the bar position and converts the error to loop fractions', () => {
            const out = createDanceTimingResult();
            const barsPerLoop = CLIP_BEATS / 4;
            // The clip is at the start of a bar, the music 0.01 bars further on, so the clip is 0.01 bars behind.
            const rhythm = makeRhythm({ barPhase: 0.01 });
            step(rhythm, createDanceTimingState(), out, { clipPhase: 0, dt: 0.1 });
            expect(out.barLocked).toBe(true);
            expect(out.phaseNudge).toBeCloseTo((0.01 * 3 * 0.1) / barsPerLoop, 9);
            // Across the wrap the short way: clip at 0.995 of a bar, music at 0.005 (0.01 ahead).
            step(makeRhythm({ barPhase: 0.005 }), createDanceTimingState(), out, {
                clipPhase: 0.995 / barsPerLoop,
                dt: 0.1,
            });
            expect(out.phaseNudge).toBeCloseTo((0.01 * 3 * 0.1) / barsPerLoop, 9);
        });

        it('caps the nudge at the per-second limit in both directions', () => {
            const out = createDanceTimingResult();
            step(makeRhythm({ barPhase: 0.5 }), createDanceTimingState(), out, { dt: 0.1 });
            expect(out.phaseNudge).toBeCloseTo(MAX_PHASE_NUDGE_PER_SECOND * 0.1, 12);
            // The clip is 0.35 bars ahead of the music.
            step(makeRhythm({ barPhase: 0.4 }), createDanceTimingState(), out, {
                clipPhase: 0.75 / (CLIP_BEATS / 4),
                dt: 0.1,
            });
            expect(out.phaseNudge).toBeCloseTo(-MAX_PHASE_NUDGE_PER_SECOND * 0.1, 12);
        });

        it('treats an error of exactly half a bar as positive', () => {
            const out = createDanceTimingResult();
            step(makeRhythm({ barPhase: 0.5 }), createDanceTimingState(), out);
            expect(out.phaseNudge).toBeGreaterThan(0);
        });

        it('gives no nudge for a zero frame step and treats a long one as MAX_FRAME_DT', () => {
            const out = createDanceTimingResult();
            step(makeRhythm({ barPhase: 0.3 }), createDanceTimingState(), out, { dt: 0 });
            expect(out.phaseNudge).toBe(0);
            const long = { ...step(makeRhythm({ barPhase: 0.3 }), createDanceTimingState(), out, { dt: 5 }) };
            const capped = step(makeRhythm({ barPhase: 0.3 }), createDanceTimingState(), out, { dt: 0.1 });
            expect(long).toEqual(capped);
            step(makeRhythm(), createDanceTimingState(), out, { dt: -1 });
            expect(out.phaseNudge).toBe(0);
        });
    });

    describe('beat-only fallback', () => {
        const cases: Array<[string, RhythmOverrides]> = [
            ['beatsPerBar 3', { beatsPerBar: 3 }],
            ['beatsPerBar undefined', { beatsPerBar: undefined }],
            ['barPhase undefined', { barPhase: undefined }],
            ['low meter confidence', { meterConfidence: METER_ENTER_CONFIDENCE - 0.01 }],
        ];

        it.each(cases)('aligns the beat slot without drifting with %s', (_name, rhythm) => {
            const first = simulate({ bpm: 128, seconds: 25, startClipPhase: 0.9, rhythm });
            expect(first.out.barLocked).toBe(false);
            const slotError = (r: ReturnType<typeof simulate>) => {
                // The phase at the time reached after the last frame, which is where the clip has got to.
                const beats = r.time * (128 / 60);
                const beatPhase = beats - Math.floor(beats);
                return Math.abs(wrapSigned(beatPhase - r.clipPhase * CLIP_BEATS));
            };
            expect(slotError(first)).toBeLessThan(0.02);
            // Ten more seconds: still on the beat, so there is no drift against the beats.
            const later = simulate({
                bpm: 128,
                seconds: 10,
                rhythm,
                state: first.state,
                out: first.out,
                clipPhase: first.clipPhase,
                time: first.time,
            });
            expect(slotError(later)).toBeLessThan(0.02);
            expect(first.maxNudgeRatio).toBeLessThanOrEqual(1 + 1e-9);
        });

        it('wraps the beat error across 0 and 1 the short way', () => {
            const out = createDanceTimingResult();
            // The clip is at 0.98 of its beat slot and the music at 0.02 of the next beat: 0.04 beats behind.
            const rhythm = makeRhythm({ beatsPerBar: 3, beatPhase: 0.02 });
            step(rhythm, createDanceTimingState(), out, { clipPhase: 0.98 / CLIP_BEATS, dt: 0.1 });
            expect(out.phaseNudge).toBeCloseTo((0.04 * 3 * 0.1) / CLIP_BEATS, 9);
        });
    });

    describe('tempo lock hysteresis', () => {
        const mid = (TEMPO_LOCK_CONFIDENCE + TEMPO_LOSE_CONFIDENCE) / 2;

        it('stays unlocked between the two thresholds, and locks at the upper one', () => {
            const state = createDanceTimingState();
            const out = createDanceTimingResult();
            step(makeRhythm({ tempoConfidence: mid }), state, out);
            expect(out.normalizedBpm).toBeUndefined();
            step(makeRhythm({ tempoConfidence: TEMPO_LOCK_CONFIDENCE }), state, out);
            expect(out.normalizedBpm).toBe(120);
        });

        it('stays locked between the two thresholds, and releases below the lower one', () => {
            const state = createDanceTimingState();
            const out = createDanceTimingResult();
            step(makeRhythm({ tempoConfidence: 0.5 }), state, out);
            step(makeRhythm({ tempoConfidence: mid }), state, out);
            expect(out.normalizedBpm).toBe(120);
            step(makeRhythm({ tempoConfidence: TEMPO_LOSE_CONFIDENCE }), state, out);
            expect(out.normalizedBpm).toBe(120);
            step(makeRhythm({ tempoConfidence: TEMPO_LOSE_CONFIDENCE - 0.01 }), state, out);
            expect(out.normalizedBpm).toBeUndefined();
            expect(out.barLocked).toBe(false);
            step(makeRhythm({ tempoConfidence: mid }), state, out);
            expect(out.normalizedBpm).toBeUndefined();
        });

        it('needs a known tempo and a beat phase to lock, and loses the lock without them', () => {
            const state = createDanceTimingState();
            const out = createDanceTimingResult();
            step(makeRhythm({ bpm: 0 }), state, out);
            expect(out.normalizedBpm).toBeUndefined();
            step(makeRhythm({ beatPhase: undefined }), state, out);
            expect(out.normalizedBpm).toBeUndefined();
            step(makeRhythm(), state, out);
            expect(out.normalizedBpm).toBe(120);
            step(makeRhythm({ beatPhase: undefined }), state, out);
            expect(out.normalizedBpm).toBeUndefined();
            step(makeRhythm(), state, out);
            step(makeRhythm({ bpm: 0 }), state, out);
            expect(out.normalizedBpm).toBeUndefined();
        });
    });

    describe('meter lock hysteresis', () => {
        const mid = (METER_ENTER_CONFIDENCE + METER_EXIT_CONFIDENCE) / 2;

        it('enters at the upper threshold, holds between, and leaves below the lower one', () => {
            const state = createDanceTimingState();
            const out = createDanceTimingResult();
            step(makeRhythm({ meterConfidence: mid }), state, out);
            expect(out.barLocked).toBe(false);
            step(makeRhythm({ meterConfidence: METER_ENTER_CONFIDENCE }), state, out);
            expect(out.barLocked).toBe(true);
            step(makeRhythm({ meterConfidence: mid }), state, out);
            expect(out.barLocked).toBe(true);
            step(makeRhythm({ meterConfidence: METER_EXIT_CONFIDENCE }), state, out);
            expect(out.barLocked).toBe(true);
            step(makeRhythm({ meterConfidence: METER_EXIT_CONFIDENCE - 0.01 }), state, out);
            expect(out.barLocked).toBe(false);
            step(makeRhythm({ meterConfidence: mid }), state, out);
            expect(out.barLocked).toBe(false);
        });

        it.each([
            ['beatsPerBar becomes 3', { beatsPerBar: 3 as const }],
            ['beatsPerBar becomes undefined', { beatsPerBar: undefined }],
            ['barPhase becomes undefined', { barPhase: undefined }],
            ['the tempo lock is lost', { tempoConfidence: 0 }],
        ])('releases at once when %s', (_name, overrides) => {
            const state = createDanceTimingState();
            const out = createDanceTimingResult();
            step(makeRhythm(), state, out);
            expect(out.barLocked).toBe(true);
            step(makeRhythm(overrides), state, out);
            expect(out.barLocked).toBe(false);
        });
    });

    describe('unlocked', () => {
        it('runs at the calm rate times the free dance speed, with no nudge', () => {
            for (const danceSpeed of [0.5, 0.8, 1, 1.1]) {
                const { out } = simulate({ bpm: 0, seconds: 8, danceSpeed, rhythm: { beatPhase: undefined } });
                expect(out.timeScale).toBeCloseTo(CALM_TIME_SCALE * danceSpeed, 3);
                expect(out.phaseNudge).toBe(0);
                expect(out.normalizedBpm).toBeUndefined();
                expect(out.barLocked).toBe(false);
                expect(out.danceWeight).toBeCloseTo(CALM_DANCE_WEIGHT, 3);
            }
        });

        it('never reaches a time scale of zero', () => {
            const state = createDanceTimingState();
            const out = createDanceTimingResult();
            const silent = createRhythmState();
            for (let i = 0; i < 600; i++) {
                step(silent, state, out, { danceSpeed: 0 });
                expect(out.timeScale).toBeGreaterThanOrEqual(MIN_TIME_SCALE);
            }
            expect(out.timeScale).toBeCloseTo(MIN_TIME_SCALE, 6);
        });

        it('eases between calm and locked without a discontinuity in time scale or dance weight', () => {
            const state = createDanceTimingState();
            const out = createDanceTimingResult();
            let previousScale = out.timeScale;
            let previousWeight = out.danceWeight;
            const maxWeightStep = (1 - CALM_DANCE_WEIGHT) * (1 - Math.exp(-DANCE_WEIGHT_RATE * DT));
            const readings = [createRhythmState(), makeRhythm({ bpm: 170 }), createRhythmState()];
            for (const rhythm of readings) {
                for (let i = 0; i < 120; i++) {
                    step(rhythm, state, out);
                    expect(Math.abs(out.timeScale - previousScale)).toBeLessThanOrEqual(
                        MAX_TIME_SCALE_CHANGE_PER_SECOND * DT + 1e-12,
                    );
                    expect(Math.abs(out.danceWeight - previousWeight)).toBeLessThanOrEqual(maxWeightStep + 1e-12);
                    expect(out.danceWeight).toBeGreaterThanOrEqual(CALM_DANCE_WEIGHT);
                    expect(out.danceWeight).toBeLessThanOrEqual(1);
                    previousScale = out.timeScale;
                    previousWeight = out.danceWeight;
                }
            }
            expect(out.timeScale).toBeCloseTo(CALM_TIME_SCALE, 2);
            expect(out.danceWeight).toBeCloseTo(CALM_DANCE_WEIGHT, 2);
        });

        it('settles the dance weight in about 0.6 s either way', () => {
            const state = createDanceTimingState();
            const out = createDanceTimingResult();
            const frames = Math.round(0.6 / DT);
            for (let i = 0; i < frames; i++) step(makeRhythm(), state, out);
            expect(out.danceWeight).toBeGreaterThan(0.95);
            for (let i = 0; i < frames; i++) step(createRhythmState(), state, out);
            expect(out.danceWeight).toBeLessThan(CALM_DANCE_WEIGHT + 0.05);
        });
    });

    describe('song changes', () => {
        it('releases the locks and the octave memory, keeps the time scale, and re-syncs once confident again', () => {
            const state = createDanceTimingState();
            const out = createDanceTimingResult();
            for (let i = 0; i < 300; i++) step(makeRhythm({ bpm: 130 }), state, out);
            const before = out.timeScale;
            expect(before).toBeCloseTo(130 / NATIVE_BPM, 2);
            expect(out.barLocked).toBe(true);

            // The tracker reports no tempo right after a song change.
            step(silentRhythm(1), state, out);
            expect(out.normalizedBpm).toBeUndefined();
            expect(out.barLocked).toBe(false);
            expect(Math.abs(out.timeScale - before)).toBeLessThanOrEqual(MAX_TIME_SCALE_CHANGE_PER_SECOND * DT);

            // The new song is confident at half the old tempo; without the reset the octave memory would pick 160.
            step(makeRhythm({ bpm: 80, songChangeCount: 1 }), state, out);
            expect(out.normalizedBpm).toBeCloseTo(80, 9);
        });

        it('releases the meter lock on a change that arrives with an unconfident meter', () => {
            const state = createDanceTimingState();
            const out = createDanceTimingResult();
            step(makeRhythm(), state, out);
            expect(out.barLocked).toBe(true);
            step(makeRhythm({ songChangeCount: 1, meterConfidence: 0 }), state, out);
            expect(out.barLocked).toBe(false);
            expect(out.normalizedBpm).toBe(120);
        });

        it('does not lock again when the change arrives with an unconfident tempo', () => {
            const state = createDanceTimingState();
            const out = createDanceTimingResult();
            step(makeRhythm(), state, out);
            expect(out.normalizedBpm).toBe(120);
            step(makeRhythm({ songChangeCount: 1, tempoConfidence: 0.1 }), state, out);
            expect(out.normalizedBpm).toBeUndefined();
        });

        it('does not treat the first reading as a song change', () => {
            const state = createDanceTimingState();
            const out = createDanceTimingResult();
            step(makeRhythm({ songChangeCount: 7 }), state, out);
            expect(out.normalizedBpm).toBe(120);
            step(makeRhythm({ songChangeCount: 7 }), state, out);
            expect(out.normalizedBpm).toBe(120);
        });
    });
});

// A silent tracker reading with a given song change counter.
function silentRhythm(songChangeCount: number): RhythmState {
    const rhythm = createRhythmState();
    rhythm.songChangeCount = songChangeCount;
    return rhythm;
}

describe('timing invariants', () => {
    // The scene advances the mixer by dt * timeScale + phaseNudge * duration, so this keeps that step positive while
    // the tempo is locked (the nudge is 0 while unlocked).
    it('keeps the locked clip advancing forward even with the largest phase correction', () => {
        const slowestLockedTimeScale = (NORMALIZED_BPM_MIN / NATIVE_BPM) * Math.min(...STEP_MULTIPLES);
        const largestBackwardNudge = MAX_PHASE_NUDGE_PER_SECOND * DANCE_CLIP_DURATION;
        expect(slowestLockedTimeScale).toBeGreaterThan(largestBackwardNudge);
    });
});
