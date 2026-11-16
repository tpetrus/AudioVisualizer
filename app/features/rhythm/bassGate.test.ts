import { describe, expect, it } from 'vitest';
import { createBassGateState, forgetBassline, stepBassGate } from './bassGate';
import {
    BASS_GATE_ATTACK_SECONDS,
    BASS_GATE_BAR_WINDOW,
    BASS_GATE_CHANCE_MARGIN,
    BASS_GATE_CHANCE_MIN,
    BASS_GATE_DENSITY_BEATS,
    BASS_GATE_EASE_SECONDS,
    BASS_GATE_GRACE_BEATS,
    BASS_GATE_LOCK_GRACE_SECONDS,
    BASS_GATE_MIN_INTERVAL,
    BASS_GATE_REPEAT_RATE,
    BASS_GATE_SCORE_DECAY,
    BASS_GATE_SCORE_MAX,
} from './bassGateConfig';
import { createRhythmState } from './types';

const DT = 1 / 60;
// 120 BPM: a beat every 30 frames.
const FRAMES_PER_BEAT = 30;
// Beats of on-beat kicks that leave the gate open with its fade-in finished: the kicks of the first bar have no earlier
// bar to repeat and say nothing, the repeats after them open the gate on the kick of beat 8, and the fade takes three
// more.
const WARM_BEATS = 16;

type State = ReturnType<typeof createBassGateState>;

// Steps the gate with a 120 BPM clock. `bassAt(frame, phase)` gives the raw bass for each frame. A given `rhythm` is
// kept across calls, for specs that change it (a song change) between them.
function drive(
    frames: number,
    bassAt: (frame: number, phase: number) => number,
    options: { locked?: boolean; start?: number; state?: State; rhythm?: ReturnType<typeof createRhythmState> } = {},
) {
    const state = options.state ?? createBassGateState();
    const rhythm = options.rhythm ?? createRhythmState();
    const outputs: number[] = [];
    const start = options.start ?? 0;
    for (let i = start; i < start + frames; i++) {
        const beat = i / FRAMES_PER_BEAT;
        rhythm.beatPhase = beat % 1;
        rhythm.beatCount = Math.floor(beat);
        outputs.push(stepBassGate(bassAt(i, rhythm.beatPhase), rhythm, options.locked ?? true, state, DT));
    }
    return { state, rhythm, outputs };
}

// The largest output in each beat of `outputs` (which started at a beat).
function peaksPerBeat(outputs: readonly number[]): number[] {
    const peaks: number[] = [];
    for (let i = 0; i < outputs.length; i += FRAMES_PER_BEAT) {
        peaks.push(Math.max(...outputs.slice(i, i + FRAMES_PER_BEAT)));
    }
    return peaks;
}

// A kick on every beat: 4 frames of 0.8 right after the beat, silence between.
const onBeatKick = (frame: number) => (frame % FRAMES_PER_BEAT < 4 ? 0.8 : 0);
const silent = () => 0;

// A gate locked onto on-beat kicks for the warm-up beats, with its fade-in finished.
function locked(): State {
    const { state } = drive(FRAMES_PER_BEAT * WARM_BEATS, onBeatKick);
    expect(state.open).toBe(true);
    expect(state.weight).toBe(1);
    return state;
}

describe('stepBassGate', () => {
    it('opens after a short run of kicks at one place, then pulses on every beat', () => {
        const { state, outputs } = drive(FRAMES_PER_BEAT * WARM_BEATS, onBeatKick);
        expect(state.open).toBe(true);
        // The first bar's kicks have no earlier bar and the repeats open the gate on beat 8, so the first beats show
        // nothing.
        expect(outputs.slice(0, FRAMES_PER_BEAT * 4).every((value) => value === 0)).toBe(true);
        for (const peak of peaksPerBeat(outputs).slice(-4)) expect(peak).toBeGreaterThan(0.9);
    });

    // The user's report: bumps showed at a song's start and stopped 10 to 15 s in. The bass pulse compares the bass
    // with its last ~1.5 s, so mid-song a kick is only a small rise on a raised floor: here it swings between 0.2 and
    // 0.32 every beat.
    it('locks onto kicks that are only a small rise on a raised floor', () => {
        const midSong = (frame: number) => (frame % FRAMES_PER_BEAT < 6 ? 0.32 : 0.2);
        const { state, outputs } = drive(FRAMES_PER_BEAT * 60, midSong);
        expect(state.open).toBe(true);
        for (const peak of peaksPerBeat(outputs).slice(-40)) expect(peak).toBeGreaterThanOrEqual(0.5);
    });

    // Measured with the e2e beat fixture: the bass pulse often stands out only once a bar.
    it('opens on one kick per bar and then pulses on every beat', () => {
        const kickPerBar = (frame: number) => (frame % (FRAMES_PER_BEAT * 4) < 4 ? 0.8 : 0);
        const { state, outputs } = drive(FRAMES_PER_BEAT * 4 * 10, kickPerBar);
        expect(state.open).toBe(true);
        for (const peak of peaksPerBeat(outputs).slice(-8)) expect(peak).toBeGreaterThan(0.5);
    });

    // Business as usual: a locked bassline keeps pulsing through masked kicks and extra notes.
    it('keeps pulsing on every beat through eight beats in which no kick is heard', () => {
        const state = locked();
        const { outputs } = drive(FRAMES_PER_BEAT * 8, silent, { state, start: FRAMES_PER_BEAT * WARM_BEATS });
        expect(state.open).toBe(true);
        for (const peak of peaksPerBeat(outputs)) expect(peak).toBeGreaterThan(0.9);
    });

    it('is not shaken by extra notes between the beats once locked', () => {
        const state = locked();
        const score = state.score;
        // The kick plus a second note half way through every beat.
        const busy = (frame: number) => (frame % FRAMES_PER_BEAT < 4 || frame % FRAMES_PER_BEAT >= 15 ? 0.8 : 0);
        drive(FRAMES_PER_BEAT * 16, busy, { state, start: FRAMES_PER_BEAT * WARM_BEATS });
        expect(state.open).toBe(true);
        expect(state.score).toBeGreaterThanOrEqual(score);
        expect(state.kickPhase).toBeLessThan(0.1);
    });

    it('does not show a stray bump between the beats', () => {
        const start = FRAMES_PER_BEAT * WARM_BEATS;
        const plain = drive(FRAMES_PER_BEAT, silent, { state: locked(), start });
        const stray = drive(FRAMES_PER_BEAT, (frame) => (frame - start >= 14 && frame - start < 18 ? 0.9 : 0), {
            state: locked(),
            start,
        });
        expect(stray.outputs).toEqual(plain.outputs);
    });

    it('keeps the pulse for the grace period after the kicks stop, then fades it out', () => {
        const state = locked();
        const start = FRAMES_PER_BEAT * WARM_BEATS;
        drive(FRAMES_PER_BEAT * BASS_GATE_GRACE_BEATS, silent, { state, start });
        expect(state.open).toBe(true);
        const after = drive(FRAMES_PER_BEAT * 16, silent, {
            state,
            start: start + FRAMES_PER_BEAT * BASS_GATE_GRACE_BEATS,
        });
        expect(state.open).toBe(false);
        expect(after.outputs.at(-1)).toBe(0);
    });

    // Fitted to a real syncopated bassline (docs/agents/rhythm-findings.md): the kicks repeat every bar, but only about a
    // third land at one place in the beat, so the notes elsewhere must not spend the evidence the hits earn.
    it('opens within 16 beats on a syncopated bassline', () => {
        const pattern = [0, 1, 1.3, 2.55, 3.3];
        const bass = (frame: number) => {
            const position = (frame / FRAMES_PER_BEAT) % 4;
            return pattern.some((place) => position >= place && position < place + 4 / FRAMES_PER_BEAT) ? 0.8 : 0;
        };
        expect(drive(FRAMES_PER_BEAT * WARM_BEATS, bass).state.open).toBe(true);
    });

    // Bass bumps at a different place in every beat have no rhythm, so they never open the gate: a bassline repeats every
    // bar, and a random kick repeats the previous bar's only now and then, about as often as the chance it is weighed
    // against, which earns it no evidence. (A bassline that lands at the same off-beat place every beat does keep the
    // tempo, and is shown.)
    function showsNothing(start: number): void {
        let seed = start;
        const random = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
        const bumpFrame = Array.from({ length: 40 }, () => Math.floor(random() * FRAMES_PER_BEAT));
        const { outputs, state } = drive(FRAMES_PER_BEAT * 40, (frame) => {
            const beat = Math.floor(frame / FRAMES_PER_BEAT);
            const at = frame % FRAMES_PER_BEAT;
            return at >= bumpFrame[beat] && at < bumpFrame[beat] + 4 ? 0.9 : 0;
        });
        expect(Math.max(...outputs)).toBe(0);
        expect(state.open).toBe(false);
    }

    it.each([1, 7, 99, 2024, 42])('never shows bumps at random places in the beat (seed %i)', showsNothing);

    // The same bar every time, each note a little off its place: real loosely played bass, which must still be shown.
    it('opens on a bar that repeats with jittered notes, and stays open', () => {
        const pattern = [0, 1, 1.3, 2.55, 3.3];
        const jitter = [0.04, -0.05, 0.02, 0.06, -0.03, 0.05, -0.04];
        const bass = (frame: number) => {
            const bar = Math.floor(frame / (FRAMES_PER_BEAT * 4));
            const position = (frame / FRAMES_PER_BEAT) % 4;
            return pattern.some((place, i) => {
                const at = place + jitter[(bar + i) % jitter.length];
                return position >= at && position < at + 4 / FRAMES_PER_BEAT;
            })
                ? 0.8
                : 0;
        };
        const { state, outputs } = drive(FRAMES_PER_BEAT * 40, bass);
        expect(state.open).toBe(true);
        expect(Math.max(...outputs.slice(-FRAMES_PER_BEAT * 8))).toBeGreaterThan(0.5);
    });

    it('shows nothing while the tempo has never locked, whatever the bass', () => {
        const { outputs, state } = drive(FRAMES_PER_BEAT * WARM_BEATS, onBeatKick, { locked: false });
        expect(Math.max(...outputs)).toBe(0);
        expect(state.open).toBe(false);
    });

    it('holds the bassline through a short tempo dropout and forgets it after a long one', () => {
        const state = locked();
        let at = FRAMES_PER_BEAT * WARM_BEATS;
        const short = Math.floor(BASS_GATE_LOCK_GRACE_SECONDS / 2 / DT);
        drive(short, onBeatKick, { state, locked: false, start: at });
        at += short;
        expect(state.open).toBe(true);
        drive(FRAMES_PER_BEAT * 2, onBeatKick, { state, start: at });
        at += FRAMES_PER_BEAT * 2;
        drive(Math.ceil((BASS_GATE_LOCK_GRACE_SECONDS + 0.5) / DT), onBeatKick, { state, locked: false, start: at });
        expect(state.open).toBe(false);
        expect(state.phaseKnown).toBe(false);
    });

    it('forgets the bassline when the song changes, and fades out rather than snapping', () => {
        const { state, rhythm } = drive(FRAMES_PER_BEAT * WARM_BEATS, onBeatKick);
        rhythm.songChangeCount++;
        rhythm.beatPhase = 0.5;
        stepBassGate(0, rhythm, true, state, DT);
        expect(state.open).toBe(false);
        expect(state.score).toBe(0);
        expect(state.weight).toBeGreaterThan(0.9);
    });

    it('learns a new place only after the bassline has moved for a long time', () => {
        const state = locked();
        // The same kick, now half a beat later.
        const offBeat = (frame: number) => ((frame + FRAMES_PER_BEAT / 2) % FRAMES_PER_BEAT < 4 ? 0.8 : 0);
        const start = FRAMES_PER_BEAT * WARM_BEATS;
        drive(FRAMES_PER_BEAT * 8, offBeat, { state, start });
        // Two bars of a moved bassline are not enough to give up on the old one.
        expect(state.open).toBe(true);
        expect(state.kickPhase).toBeLessThan(0.1);
        drive(FRAMES_PER_BEAT * 40, offBeat, { state, start: start + FRAMES_PER_BEAT * 8 });
        expect(state.open).toBe(true);
        expect(state.kickPhase).toBeCloseTo(0.5, 1);
    });

    it('starts at most three bumps in any closed second, however fast the beat', () => {
        const state = locked();
        // A 360 BPM clock (a beat every 10 frames) with a kick on each beat.
        const starts: number[] = [];
        const rhythm = createRhythmState();
        for (let i = 0; i < 180; i++) {
            rhythm.beatPhase = (i % 10) / 10;
            rhythm.beatCount = 1000 + Math.floor(i / 10);
            stepBassGate(i % 10 < 3 ? 0.9 : 0, rhythm, true, state, DT);
            if (Math.abs(state.attackLeft - (BASS_GATE_ATTACK_SECONDS - DT)) < 1e-9) starts.push(i);
        }
        expect(starts.length).toBeGreaterThan(3);
        for (const first of starts) {
            expect(starts.filter((frame) => frame >= first && frame <= first + 60).length).toBeLessThanOrEqual(3);
        }
        for (let i = 1; i < starts.length; i++) {
            expect((starts[i] - starts[i - 1]) * DT).toBeGreaterThanOrEqual(BASS_GATE_MIN_INTERVAL - 1e-9);
        }
    });

    it('fades out over the whole ease time and stays within [0, 1]', () => {
        const opening = drive(FRAMES_PER_BEAT * WARM_BEATS, onBeatKick);
        for (const value of opening.outputs) {
            expect(value).toBeGreaterThanOrEqual(0);
            expect(value).toBeLessThanOrEqual(1);
        }
        const fading = opening.state;
        forgetBassline(fading);
        drive(Math.round(BASS_GATE_EASE_SECONDS / 2 / DT), silent, {
            state: fading,
            start: FRAMES_PER_BEAT * WARM_BEATS,
        });
        expect(fading.weight).toBeCloseTo(0.5, 1);
        drive(Math.round(BASS_GATE_EASE_SECONDS / DT), silent, { state: fading, start: FRAMES_PER_BEAT * 20 });
        expect(fading.weight).toBe(0);
    });

    it('counts each bump start exactly once and never counts down', () => {
        const state = createBassGateState();
        const rhythm = createRhythmState();
        const starts: number[] = [];
        let previous = 0;
        for (let i = 0; i < FRAMES_PER_BEAT * 24; i++) {
            const beat = i / FRAMES_PER_BEAT;
            rhythm.beatPhase = beat % 1;
            rhythm.beatCount = Math.floor(beat);
            const wasSinceBump = state.sinceBump;
            stepBassGate(onBeatKick(i), rhythm, true, state, DT);
            expect(state.bumpCount).toBeGreaterThanOrEqual(previous);
            expect(state.bumpCount - previous).toBeLessThanOrEqual(1);
            // A bump starts exactly when the timer is zeroed.
            const started = state.sinceBump === 0 && wasSinceBump > 0;
            expect(state.bumpCount - previous).toBe(started ? 1 : 0);
            if (started) starts.push(i);
            previous = state.bumpCount;
        }
        expect(state.bumpCount).toBe(starts.length);
        expect(state.bumpCount).toBeGreaterThan(10);
    });

    it('leaves bumpCount and kickOffset alone when the bassline is forgotten', () => {
        const state = locked();
        const { bumpCount, kickOffset } = state;
        expect(bumpCount).toBeGreaterThan(0);
        forgetBassline(state);
        expect(state.bumpCount).toBe(bumpCount);
        expect(state.kickOffset).toBe(kickOffset);
    });

    it('starts kickOffset at NaN, keeps it NaN until a place is known, then records the wrapped offset', () => {
        const state = createBassGateState();
        const rhythm = createRhythmState();
        expect(state.bumpCount).toBe(0);
        expect(state.kickOffset).toBeNaN();

        // The first kick sets the place: no offset is measured against a place that was not known.
        rhythm.beatPhase = 0.1;
        stepBassGate(0.8, rhythm, true, state, DT);
        expect(state.phaseKnown).toBe(true);
        expect(state.kickPhase).toBeCloseTo(0.1, 12);
        expect(state.kickOffset).toBeNaN();

        // Re-arm, then a kick 0.05 beats late is measured before the place adapts.
        stepBassGate(0, rhythm, true, state, DT);
        rhythm.beatPhase = 0.15;
        stepBassGate(0.8, rhythm, true, state, DT);
        expect(state.kickOffset).toBeCloseTo(0.05, 12);

        // A kick just before the place across the wrap is a small negative offset, not nearly a whole beat.
        stepBassGate(0, rhythm, true, state, DT);
        rhythm.beatPhase = (state.kickPhase - 0.2 + 1) % 1;
        stepBassGate(0.8, rhythm, true, state, DT);
        expect(state.kickOffset).toBeCloseTo(-0.2, 12);
    });

    it('shows nothing and learns nothing before the tracker has found a beat', () => {
        const state = createBassGateState();
        const rhythm = createRhythmState();
        expect(rhythm.beatPhase).toBeUndefined();
        expect(stepBassGate(0.9, rhythm, true, state, DT)).toBe(0);
        expect(state.phaseKnown).toBe(false);
        expect(state.bumpCount).toBe(0);
    });

    it('clamps a huge or negative dt and ignores out of range bass', () => {
        const state = createBassGateState();
        const rhythm = createRhythmState();
        rhythm.beatPhase = 0;
        expect(stepBassGate(5, rhythm, true, state, 100)).toBe(0);
        expect(stepBassGate(-3, rhythm, true, state, -1)).toBe(0);
        expect(state.weight).toBe(0);
    });
});

// While closed, the gate adds up evidence from kicks that repeat a bar earlier, each weighed against the chance that
// random bass would repeat it. These specs pin that rule through `state.score` and the beat at which the gate opens.
describe('stepBassGate evidence while closed', () => {
    // A kick (4 frames at 0.8) at each given beat position, which must fall on a whole frame.
    function kicksAt(beats: readonly number[]) {
        const starts = beats.map((beat) => Math.round(beat * FRAMES_PER_BEAT));
        return (frame: number) => (starts.some((start) => frame >= start && frame < start + 4) ? 0.8 : 0);
    }

    const GRACE_FRAMES = BASS_GATE_GRACE_BEATS * FRAMES_PER_BEAT;

    // The score just after the kick that starts at `beat`, with every kick before it already counted.
    function scoreAfterKickAt(bass: (frame: number) => number, beat: number): number {
        return drive(Math.round(beat * FRAMES_PER_BEAT) + 1, bass).state.score;
    }

    // The beat of the kick that opens the gate, or undefined when it never opens within `beats`.
    function openingBeat(bass: (frame: number) => number, beats: number): number | undefined {
        const state = createBassGateState();
        for (let frame = 0; frame < beats * FRAMES_PER_BEAT; frame++) {
            drive(1, bass, { state, start: frame });
            if (state.open) return frame / FRAMES_PER_BEAT;
        }
        return undefined;
    }

    // The chance the gate weighs a repeat against when `recent` kicks landed in the last DENSITY_BEATS beats, before
    // its two limits.
    function chanceFor(recent: number): number {
        return 1 - Math.exp(-(recent / BASS_GATE_DENSITY_BEATS) * 2 * BASS_GATE_BAR_WINDOW * BASS_GATE_CHANCE_MARGIN);
    }

    const repeatGain = (chance: number) => Math.log(BASS_GATE_REPEAT_RATE / chance);
    const missLoss = (chance: number) => Math.log((1 - BASS_GATE_REPEAT_RATE) / (1 - chance));

    // The bassline is one kick at the start of every bar, so a missed kick leaves nothing within a beat of its place.
    it('looks two bars back past a missed kick, so one miss costs one bar and not two', () => {
        const bars = [0, 4, 8, 12, 16, 20, 24];
        const whole = kicksAt(bars);
        const missed = kicksAt(bars.filter((beat) => beat !== 8));
        expect(openingBeat(whole, 24)).toBe(12);
        // The kick at 12 finds nothing at 8 and is compared with the kick at 4 instead, so it counts as a repeat: the
        // miss delays the opening by one bar. Without that look-back the kick at 12 would count for nothing and the gate
        // would open a bar later still, at 20.
        expect(openingBeat(missed, 24)).toBe(16);
        expect(scoreAfterKickAt(missed, 12)).toBeCloseTo(2 * repeatGain(BASS_GATE_CHANCE_MIN), 9);
        expect(drive(12 * FRAMES_PER_BEAT + 1, whole).state.open).toBe(true);
    });

    it('leaves the score at 0 for the kicks of the first bar, which have no earlier bar, and opens on time', () => {
        const state = drive(4 * FRAMES_PER_BEAT, onBeatKick).state;
        expect(state.score).toBe(0);
        expect(state.open).toBe(false);
        expect(openingBeat(onBeatKick, 16)).toBe(8);
    });

    it('leaves the score as it was for a kick after a silence of more than two bars', () => {
        const bass = kicksAt([0, 4, 8, 18]);
        const before = scoreAfterKickAt(bass, 8);
        expect(before).toBeGreaterThan(0);
        // Nothing landed within a beat of 14 or of 10, so the kick at 18 has no earlier bar and says nothing, not even
        // that it did not repeat.
        expect(scoreAfterKickAt(bass, 18)).toBe(before);
    });

    it('adds less for the same repeat when more kicks landed in the last eight beats', () => {
        // The kick at beat 4 repeats the kick at 0; the other kicks only make the bass busier, and have no earlier bar.
        const sparse = scoreAfterKickAt(kicksAt([0, 2, 4]), 4);
        const busy = scoreAfterKickAt(kicksAt([0, 1, 2, 3, 4]), 4);
        const busier = scoreAfterKickAt(kicksAt([0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4]), 4);
        expect(sparse).toBeCloseTo(repeatGain(chanceFor(2)), 9);
        expect(busy).toBeCloseTo(repeatGain(chanceFor(4)), 9);
        expect(busier).toBeCloseTo(repeatGain(chanceFor(8)), 9);
        expect(sparse).toBeGreaterThan(busy);
        expect(busy).toBeGreaterThan(busier);

        // Busy bass of 23 kicks, one every 4 frames from beat 14, then a kick at 18 that repeats the one at 14. The
        // burst's own kicks have nothing a bar back or two back that lands within a beat of their place (the kick at 4
        // is too far), so the score stays where the kick at 4 left it until the repeat.
        const burst = (frame: number) => {
            const sinceBurst = frame - 14 * FRAMES_PER_BEAT;
            if (sinceBurst >= 0 && sinceBurst <= 22 * 4) return sinceBurst % 4 < 2 ? 0.8 : 0;
            return kicksAt([0, 4, 18])(frame);
        };
        const base = scoreAfterKickAt(burst, 4);
        expect(drive(18 * FRAMES_PER_BEAT + 1, burst).state.score - base).toBeCloseTo(repeatGain(chanceFor(23)), 9);
    });

    it('takes from the score by the chance of a miss when a kick does not repeat the bar before', () => {
        // The kick at 8.5 has a kick half a beat from its place a bar back (at 4), so it did not repeat it.
        const bass = kicksAt([0, 4, 8.5]);
        const before = scoreAfterKickAt(bass, 4);
        expect(scoreAfterKickAt(bass, 8.5)).toBeCloseTo(before + missLoss(BASS_GATE_CHANCE_MIN), 9);
    });

    // Two random notes per beat. The generator is a linear congruential one done with Math.imul, so every product wraps
    // exactly in 32 bits and the sequence is the same on every machine (a plain product would pass 2^53 and round).
    function opensOnRandomNotes(start: number, beats: number): boolean {
        let seed = start;
        const random = () => {
            seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
            return seed / 4294967296;
        };
        const notes = Array.from({ length: beats }, () => [
            Math.floor(random() * FRAMES_PER_BEAT),
            Math.floor(random() * FRAMES_PER_BEAT),
        ]);
        const state = createBassGateState();
        for (let frame = 0; frame < FRAMES_PER_BEAT * beats; frame++) {
            const at = frame % FRAMES_PER_BEAT;
            const hit = notes[Math.floor(frame / FRAMES_PER_BEAT)].some((note) => at >= note && at < note + 4);
            drive(1, () => (hit ? 0.9 : 0), { state, start: frame });
            if (state.open) return true;
        }
        return false;
    }

    function openingPatterns(beats: number): number {
        let opened = 0;
        for (let seed = 1; seed <= 300; seed++) if (opensOnRandomNotes(seed, beats)) opened++;
        return opened;
    }

    // Random bass can open the gate by chance, and the more of it there is the likelier, so the specs bound how many of
    // 300 patterns open rather than naming seeds that happen not to. Measured with this rule: 3 of 300 at 120
    // beats (bound 6) and 10 of 300 at 400 beats (bound 16); false opens grow with length. With the chance fixed at 0.2 instead of following the density, far
    // more open (checked by editing bassGate.ts and reverting it), so these guard the density rule: busy random bass
    // repeats a bar by chance far more often than 0.2 and must be weighed against that.
    it('opens on at most 6 of 300 patterns of two random notes per beat over 120 beats', () => {
        expect(openingPatterns(120)).toBeLessThanOrEqual(6);
    });

    it('opens on at most 16 of 300 patterns of two random notes per beat over 400 beats', () => {
        expect(openingPatterns(400)).toBeLessThanOrEqual(16);
    });

    // 29 or 30 kicks in the last 8 beats put the chance above the repeat rate (0.61 and 0.62 against 0.6), where the
    // log of the likelihood would turn negative for a repeat and positive for a miss.
    describe('on bass so dense that chance repeats as often as a real bassline', () => {
        // The ring holds `kicks` kicks spaced 0.26 beat apart from beat 100.1, the one at 104 included unless
        // `withoutBarBack`, with 3 points of evidence, and one more kick lands at beat 108.
        function scoreChange(kicks: number, withoutBarBack: boolean): number {
            const state = createBassGateState();
            for (let i = 0; i < kicks; i++) state.kickTimes[i] = 100.1 + i * 0.26;
            if (withoutBarBack) state.kickTimes[15] = NaN;
            state.score = 3;
            drive(1, () => 0.8, { state, start: 108 * FRAMES_PER_BEAT });
            return state.score - 3;
        }

        it('does not take evidence away for a repeat', () => {
            expect(chanceFor(30)).toBeGreaterThan(BASS_GATE_REPEAT_RATE);
            expect(scoreChange(30, false)).toBeGreaterThanOrEqual(0);
        });

        it('does not add evidence for a miss', () => {
            expect(chanceFor(29)).toBeGreaterThan(BASS_GATE_REPEAT_RATE);
            expect(scoreChange(30, true)).toBeLessThanOrEqual(0);
        });
    });

    it('holds the chance at its minimum for sparse bass', () => {
        // One kick in the eight beats before the repeat: the chance would be 0.03, but it is held at the minimum.
        expect(chanceFor(1)).toBeLessThan(BASS_GATE_CHANCE_MIN);
        expect(scoreAfterKickAt(kicksAt([0, 4]), 4)).toBeCloseTo(repeatGain(BASS_GATE_CHANCE_MIN), 9);
    });

    it('never lets the score fall below 0, however many kicks fail to repeat', () => {
        // Each kick after the repeat at 4 lands 4.5 beats after the one before, so it misses its place a bar back.
        const bass = kicksAt([0, 4, 8.5, 13, 17.5]);
        const afterRepeat = scoreAfterKickAt(bass, 4);
        const loss = missLoss(BASS_GATE_CHANCE_MIN);
        expect(scoreAfterKickAt(bass, 13)).toBeCloseTo(afterRepeat + 2 * loss, 9);
        // The next miss would take it below 0.
        expect(afterRepeat + 3 * loss).toBeLessThan(0);
        expect(scoreAfterKickAt(bass, 17.5)).toBe(0);
    });

    it('holds a closed score for the grace beats without a match, then wears it down by the decay per beat', () => {
        const state = createBassGateState();
        state.score = 4;
        // The first call only records the beat counter, so frame 0 is not a beat; frame k * 30 starts beat k.
        drive(GRACE_FRAMES + 1, silent, { state });
        expect(state.score).toBe(4);
        drive(FRAMES_PER_BEAT, silent, { state, start: GRACE_FRAMES + 1 });
        expect(state.score).toBe(4 - BASS_GATE_SCORE_DECAY);
        drive(FRAMES_PER_BEAT, silent, { state, start: GRACE_FRAMES + 1 + FRAMES_PER_BEAT });
        expect(state.score).toBe(4 - 2 * BASS_GATE_SCORE_DECAY);
    });

    it('never lets the wearing down of unmatched beats take the score below 0', () => {
        const { state } = drive(FRAMES_PER_BEAT * 30, kicksAt([0, 4]));
        expect(state.score).toBe(0);
    });

    it('keeps the score at the maximum once open, however many kicks match', () => {
        const state = locked();
        expect(state.score).toBe(BASS_GATE_SCORE_MAX);
        drive(FRAMES_PER_BEAT * 8, onBeatKick, { state, start: FRAMES_PER_BEAT * WARM_BEATS });
        expect(state.score).toBe(BASS_GATE_SCORE_MAX);
    });

    it('starts the kicks of the next bars from nothing after the bassline is forgotten', () => {
        const state = drive(6 * FRAMES_PER_BEAT, onBeatKick).state;
        expect(state.score).toBeGreaterThan(0);
        forgetBassline(state);
        expect(state.kickTimes.every(Number.isNaN)).toBe(true);
        // The kicks at 6 and 7 would repeat those at 2 and 3 if the history had survived. Kicks 8 and 9 have nothing a
        // bar back either, and the kick at 10 is the first to repeat one.
        drive(4 * FRAMES_PER_BEAT, onBeatKick, { state, start: 6 * FRAMES_PER_BEAT });
        expect(state.score).toBe(0);
        drive(FRAMES_PER_BEAT, onBeatKick, { state, start: 10 * FRAMES_PER_BEAT });
        expect(state.score).toBeGreaterThan(0);
    });

    it('starts the kicks of the next bars from nothing after a song change', () => {
        const { state, rhythm } = drive(6 * FRAMES_PER_BEAT, onBeatKick);
        expect(state.score).toBeGreaterThan(0);
        rhythm.songChangeCount++;
        drive(4 * FRAMES_PER_BEAT, onBeatKick, { state, rhythm, start: 6 * FRAMES_PER_BEAT });
        expect(state.score).toBe(0);
        drive(FRAMES_PER_BEAT, onBeatKick, { state, rhythm, start: 10 * FRAMES_PER_BEAT });
        expect(state.score).toBeGreaterThan(0);
    });
});
