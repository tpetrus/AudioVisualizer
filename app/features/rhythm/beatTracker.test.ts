import { describe, expect, it } from 'vitest';
import { BeatTracker } from './beatTracker';
import { createRandom } from './testSignals';

const FRAME_RATE = 100;

interface Run {
    beatTimes: number[];
    beatCounts: number[];
    lockedAt: number | undefined;
}

// Drives the tracker with a pulse train at `bpm` for `seconds`, telling it the tempo (as the analyzer would).
function drive(tracker: BeatTracker, bpm: number, seconds: number, tempoBpm = bpm, startTime = 0, jitter = 0): Run {
    const random = createRandom(11);
    const run: Run = { beatTimes: [], beatCounts: [], lockedAt: undefined };
    const period = 60 / bpm;
    tracker.setTempo(tempoBpm);
    let nextPulse = period;
    for (let i = 0; i < seconds * FRAME_RATE; i++) {
        const time = startTime + i / FRAME_RATE;
        let onset = 0.05;
        if (time - startTime >= nextPulse - 0.5 / FRAME_RATE) {
            onset = 1;
            nextPulse += period;
            if (jitter > 0) {
                nextPulse += (random() * 2 - 1) * jitter;
            }
        }
        const beat = tracker.push(time, onset);
        if (tracker.locked && run.lockedAt === undefined) {
            run.lockedAt = time - startTime;
        }
        if (beat) {
            run.beatTimes.push(tracker.lastBeatTime);
            run.beatCounts.push(tracker.beatCount);
        }
    }
    return run;
}

describe('BeatTracker', () => {
    it('stays unlocked without a tempo', () => {
        const tracker = new BeatTracker(FRAME_RATE);
        tracker.setTempo(0);
        for (let i = 0; i < 1000; i++) {
            expect(tracker.push(i / FRAME_RATE, i % 50 === 0 ? 1 : 0)).toBe(false);
        }
        expect(tracker.locked).toBe(false);
        expect(tracker.periodSeconds).toBe(0);
        expect(tracker.beatCount).toBe(0);
    });

    it('locks within a few seconds once it knows the tempo', () => {
        const tracker = new BeatTracker(FRAME_RATE);
        const run = drive(tracker, 120, 10);
        expect(tracker.locked).toBe(true);
        expect(run.lockedAt).toBeDefined();
        expect(run.lockedAt ?? Infinity).toBeLessThan(5);
    });

    it.each([70, 100, 120, 160, 180])('declares beats one period apart at %i BPM', (bpm) => {
        const tracker = new BeatTracker(FRAME_RATE);
        const run = drive(tracker, bpm, 30);
        const period = 60 / bpm;
        expect(run.beatTimes.length).toBeGreaterThan((20 / period) * 0.9);
        const settled = run.beatTimes.slice(Math.ceil(8 / period));
        for (let i = 1; i < settled.length; i++) {
            expect(Math.abs(settled[i] - settled[i - 1] - period)).toBeLessThan(0.04 * period + 0.01);
        }
        expect(Math.abs(tracker.periodSeconds - period)).toBeLessThan(0.03 * period);
    });

    it('puts the declared beats on the pulses', () => {
        const tracker = new BeatTracker(FRAME_RATE);
        const bpm = 120;
        const run = drive(tracker, bpm, 30);
        const period = 60 / bpm;
        // The pulses fall at multiples of the period.
        const settled = run.beatTimes.slice(Math.ceil(10 / period));
        for (const time of settled) {
            const phase = time / period;
            const error = Math.abs(phase - Math.round(phase)) * period;
            expect(error).toBeLessThan(0.04);
        }
    });

    it('increases beatCount by exactly one per declared beat, starting at 1', () => {
        const tracker = new BeatTracker(FRAME_RATE);
        const run = drive(tracker, 110, 20);
        expect(run.beatCounts[0]).toBe(1);
        for (let i = 1; i < run.beatCounts.length; i++) {
            expect(run.beatCounts[i]).toBe(run.beatCounts[i - 1] + 1);
        }
        expect(tracker.beatCount).toBe(run.beatCounts[run.beatCounts.length - 1]);
    });

    it('tolerates a little timing jitter without losing the tempo', () => {
        const tracker = new BeatTracker(FRAME_RATE);
        drive(tracker, 120, 30, 120, 0, 0.02);
        expect(tracker.locked).toBe(true);
        expect(Math.abs(tracker.periodSeconds - 0.5)).toBeLessThan(0.03);
    });

    it('rebuilds the grid when the tempo estimate moves a long way', () => {
        const tracker = new BeatTracker(FRAME_RATE);
        drive(tracker, 100, 15);
        expect(tracker.locked).toBe(true);
        const epoch = tracker.gridEpoch;
        tracker.setTempo(160);
        expect(tracker.locked).toBe(false);
        expect(tracker.gridEpoch).toBe(epoch + 1);
    });

    // Continues the pulse train of `drive` (started at 0 with `bpm`) from `fromTime` for `seconds`, returning the beats.
    function continuePulses(tracker: BeatTracker, bpm: number, fromTime: number, seconds: number) {
        const beats: { time: number; count: number }[] = [];
        const period = 60 / bpm;
        for (let i = 0; i < seconds * FRAME_RATE; i++) {
            const time = fromTime + i / FRAME_RATE;
            const phase = (time / period) % 1;
            const onset = phase < 0.5 / FRAME_RATE / period || phase > 1 - 0.5 / FRAME_RATE / period ? 1 : 0.05;
            if (tracker.push(time, onset)) beats.push({ time: tracker.lastBeatTime, count: tracker.beatCount });
        }
        return beats;
    }

    it('keeps the grid across a halved tempo and keeps every second beat', () => {
        const tracker = new BeatTracker(FRAME_RATE);
        drive(tracker, 196, 15);
        expect(tracker.locked).toBe(true);
        const epoch = tracker.gridEpoch;
        const countBefore = tracker.beatCount;
        tracker.setTempo(98);
        expect(tracker.locked).toBe(true);
        expect(tracker.gridEpoch).toBe(epoch);
        expect(tracker.periodSeconds).toBeCloseTo(2 * (60 / 196), 1);
        const beats = continuePulses(tracker, 196, 15, 8);
        // Beats land on pulses of the old grid, two old periods apart, and are numbered on from the old count.
        for (let i = 1; i < beats.length; i++) {
            expect(beats[i].time - beats[i - 1].time).toBeCloseTo(120 / 196, 1);
            expect(beats[i].count).toBe(beats[i - 1].count + 1);
        }
        expect(beats[0].count).toBe(countBefore + 1);
        expect(tracker.gridEpoch).toBe(epoch);
    });

    // Double time with every second pulse strong: the strong pulses are the beat. Returns, for a halving after `seconds`,
    // whether the latest beat before it fell on a strong pulse and on which pulses the kept beats land.
    function halveOverAccents(seconds: number): { lastWasStrong: boolean; keptStrong: number; keptWeak: number } {
        const tracker = new BeatTracker(FRAME_RATE);
        const period = 60 / 196;
        const strength = (time: number): number => {
            const pulse = Math.round(time / period);
            const near = Math.abs(time - pulse * period) < 0.5 / FRAME_RATE;
            if (!near) return 0.05;
            return pulse % 2 === 0 ? 1 : 0.5;
        };
        const isStrong = (time: number): boolean => Math.round(time / period) % 2 === 0;
        tracker.setTempo(196);
        let i = 0;
        for (; i < seconds * FRAME_RATE; i++) tracker.push(i / FRAME_RATE, strength(i / FRAME_RATE));
        const lastWasStrong = isStrong(tracker.lastBeatTime);
        tracker.setTempo(98);
        let keptStrong = 0;
        let keptWeak = 0;
        for (const end = i + 8 * FRAME_RATE; i < end; i++) {
            if (tracker.push(i / FRAME_RATE, strength(i / FRAME_RATE))) {
                if (isStrong(tracker.lastBeatTime)) keptStrong++;
                else keptWeak++;
            }
        }
        return { lastWasStrong, keptStrong, keptWeak };
    }

    it('keeps the stronger of the two beats when the tempo halves, whichever was declared last', () => {
        // Half an old period apart, so one run halves right after a strong beat and the other right after a weak one.
        const afterStrong = halveOverAccents(15);
        const afterWeak = halveOverAccents(15 + 60 / 196);
        expect(afterStrong.lastWasStrong).not.toBe(afterWeak.lastWasStrong);
        for (const run of [afterStrong, afterWeak]) {
            expect(run.keptStrong).toBeGreaterThan(10);
            expect(run.keptWeak).toBe(0);
        }
    });

    it('keeps the grid across a doubled tempo and adds a beat between the old ones', () => {
        const tracker = new BeatTracker(FRAME_RATE);
        drive(tracker, 98, 15);
        const epoch = tracker.gridEpoch;
        const before = tracker.lastBeatTime;
        tracker.setTempo(196);
        expect(tracker.locked).toBe(true);
        expect(tracker.gridEpoch).toBe(epoch);
        expect(tracker.periodSeconds).toBeCloseTo(30 / 98, 1);
        const beats = continuePulses(tracker, 98, 15, 8);
        // The first new beat falls half an old period after the latest old one, between two old beats.
        expect(beats[0].time - before).toBeCloseTo(30 / 98, 1);
        for (let i = 1; i < beats.length; i++) {
            expect(beats[i].time - beats[i - 1].time).toBeCloseTo(30 / 98, 1);
            expect(beats[i].count).toBe(beats[i - 1].count + 1);
        }
    });

    it('treats a move of 195.7 to 98.0 as an octave but 100 to 130 as a real change', () => {
        const octave = new BeatTracker(FRAME_RATE);
        drive(octave, 195.7, 15);
        const epoch = octave.gridEpoch;
        octave.setTempo(98);
        expect(octave.gridEpoch).toBe(epoch);
        const real = new BeatTracker(FRAME_RATE);
        drive(real, 100, 15);
        real.setTempo(130);
        expect(real.gridEpoch).toBe(1);
    });

    it('keeps the grid for a small tempo change', () => {
        const tracker = new BeatTracker(FRAME_RATE);
        drive(tracker, 100, 15);
        const epoch = tracker.gridEpoch;
        tracker.setTempo(104);
        expect(tracker.locked).toBe(true);
        expect(tracker.gridEpoch).toBe(epoch);
    });

    it('follows a new tempo after the grid is rebuilt', () => {
        const tracker = new BeatTracker(FRAME_RATE);
        drive(tracker, 100, 15);
        const run = drive(tracker, 150, 20, 150, 15);
        expect(tracker.locked).toBe(true);
        expect(Math.abs(tracker.periodSeconds - 0.4)).toBeLessThan(0.02);
        const last = run.beatTimes.slice(-6);
        for (let i = 1; i < last.length; i++) {
            expect(Math.abs(last[i] - last[i - 1] - 0.4)).toBeLessThan(0.03);
        }
    });

    it('forgets everything on reset()', () => {
        const tracker = new BeatTracker(FRAME_RATE);
        drive(tracker, 120, 15);
        tracker.reset();
        expect(tracker.locked).toBe(false);
        expect(tracker.beatCount).toBe(0);
        expect(tracker.periodSeconds).toBe(0);
        expect(tracker.gridEpoch).toBe(0);
    });
});

describe('BeatTracker when it gives up its grid', () => {
    it('keeps the period of the beat that gave up the grid, while periodSeconds reports no grid', () => {
        const tracker = new BeatTracker(100);
        tracker.setTempo(120);
        let time = 0;
        const push = (onset: number) => tracker.push((time++ * 1) / 100, onset);
        // A pulse every 0.5 s aligns the grid.
        for (let i = 0; i < 500; i++) push(i % 50 < 2 ? 1 : 0.02);
        expect(tracker.periodSeconds).toBeGreaterThan(0);
        const epoch = tracker.gridEpoch;
        // A level envelope has no peak above its mean, so every predicted beat misses until the grid is given up.
        let lastDeclared = false;
        while (tracker.gridEpoch === epoch && time < 3000) lastDeclared = push(0.3);

        expect(lastDeclared).toBe(true);
        expect(tracker.periodSeconds).toBe(0);
        expect(tracker.lastBeatPeriod).toBeCloseTo(0.5, 1);
    });

    it('has no period after a reset', () => {
        const tracker = new BeatTracker(100);
        tracker.reset();
        expect(tracker.lastBeatPeriod).toBe(0);
    });
});

// The phase check. The tracker runs at 120 BPM here, so a beat is 50 frames and a hit on frame 50 * k sits on beat k.
describe('BeatTracker phase check', () => {
    const PERIOD_FRAMES = 50;
    const PERIOD = PERIOD_FRAMES / FRAME_RATE;

    interface PhaseRun {
        beatTimes: number[];
        beatCounts: number[];
        epochs: number[];
    }

    // Feeds `seconds` of an envelope that is a quiet floor plus one-frame hits chosen by `onsetAt(frame)`.
    function driveEnvelope(
        tracker: BeatTracker,
        seconds: number,
        onsetAt: (frame: number) => number,
        stopWhen?: () => boolean,
    ): PhaseRun {
        const run: PhaseRun = { beatTimes: [], beatCounts: [], epochs: [] };
        tracker.setTempo(120);
        for (let frame = 0; frame < seconds * FRAME_RATE; frame++) {
            const beat = tracker.push(frame / FRAME_RATE, Math.max(0.05, onsetAt(frame)));
            if (beat) {
                run.beatTimes.push(tracker.lastBeatTime);
                run.beatCounts.push(tracker.beatCount);
                run.epochs.push(tracker.gridEpoch);
            }
            if (stopWhen?.()) {
                break;
            }
        }
        return run;
    }

    // Distance in seconds from `time` to the nearest hit place `offsetFrames` after a beat.
    function distanceToPlace(time: number, offsetFrames: number): number {
        const shifted = time * FRAME_RATE - offsetFrames;
        const nearest = Math.round(shifted / PERIOD_FRAMES) * PERIOD_FRAMES;
        return Math.abs(shifted - nearest) / FRAME_RATE;
    }

    // Hits only on the off-beat for the first 4 s, then the on-beat at `on` and the off-beat at `off`.
    function offBeatStart(on: number, off: number): (frame: number) => number {
        return (frame) => {
            const place = frame % PERIOD_FRAMES;
            if (frame < 4 * FRAME_RATE) {
                return place === 25 ? 1 : 0;
            }
            return place === 0 ? on : place === 25 ? off : 0;
        };
    }

    function onBeatAlways(on: number, off: number): (frame: number) => number {
        return (frame) => {
            const place = frame % PERIOD_FRAMES;
            return place === 0 && frame > 0 ? on : place === 25 ? off : 0;
        };
    }

    function phaseWins(tracker: BeatTracker): number {
        return (tracker as unknown as { phaseWins: number }).phaseWins;
    }

    it('moves a grid that aligned on the off-beat to the stronger on-beat without breaking numbering', () => {
        const tracker = new BeatTracker(FRAME_RATE);
        const run = driveEnvelope(tracker, 24, offBeatStart(1, 0.6));
        // The grid really did start on the off-beat.
        expect(distanceToPlace(run.beatTimes[0], 0)).toBeGreaterThan(0.2);
        for (const time of run.beatTimes.slice(-8)) {
            expect(distanceToPlace(time, 0)).toBeLessThan(0.03);
        }
        expect(new Set(run.epochs).size).toBe(1);
        for (let i = 1; i < run.beatCounts.length; i++) {
            expect(run.beatCounts[i]).toBe(run.beatCounts[i - 1] + 1);
        }
    });

    it('never moves a grid that already sits on the stronger place', () => {
        const tracker = new BeatTracker(FRAME_RATE);
        const run = driveEnvelope(tracker, 30, onBeatAlways(1, 0.6));
        expect(run.beatTimes.length).toBeGreaterThan(40);
        for (const time of run.beatTimes.slice(8)) {
            expect(distanceToPlace(time, 0)).toBeLessThan(0.03);
        }
    });

    it('does not move for a rival place with only equal energy', () => {
        const tracker = new BeatTracker(FRAME_RATE);
        const run = driveEnvelope(tracker, 40, onBeatAlways(1, 1));
        expect(run.beatTimes.length).toBeGreaterThan(50);
        for (let i = 1; i < run.beatTimes.length; i++) {
            expect(Math.abs(run.beatTimes[i] - run.beatTimes[i - 1] - PERIOD)).toBeLessThan(0.2 * PERIOD);
        }
    });

    it('leaves a place less than a quarter beat away to the normal correction', () => {
        const tracker = new BeatTracker(FRAME_RATE);
        // 7 frames is 0.14 of a beat: inside the correction window, so it may pull the grid but never jump it.
        const run = driveEnvelope(tracker, 30, (frame) => {
            const place = frame % PERIOD_FRAMES;
            return frame < 4 * FRAME_RATE ? (place === 0 ? 1 : 0) : place === 7 ? 1 : 0;
        });
        expect(run.beatTimes.length).toBeGreaterThan(40);
        for (let i = 1; i < run.beatTimes.length; i++) {
            expect(Math.abs(run.beatTimes[i] - run.beatTimes[i - 1] - PERIOD)).toBeLessThan(0.2 * PERIOD);
        }
    });

    it('forgets the phase evidence on reset()', () => {
        const tracker = new BeatTracker(FRAME_RATE);
        driveEnvelope(tracker, 24, offBeatStart(1, 0.6), () => phaseWins(tracker) === 3);
        expect(phaseWins(tracker)).toBe(3);
        tracker.reset();
        expect(phaseWins(tracker)).toBe(0);
        expect(tracker.phaseShiftCount).toBe(0);
        const run = driveEnvelope(tracker, 30, onBeatAlways(1, 0.6));
        for (const time of run.beatTimes.slice(8)) {
            expect(distanceToPlace(time, 0)).toBeLessThan(0.03);
        }
    });

    it('moves back almost half a beat when the stronger place is just short of the off-beat', () => {
        const tracker = new BeatTracker(FRAME_RATE);
        // The new place, 28 frames after the grid's, is bin 9: an offset of -7/16 of a beat, the largest move back.
        const run = driveEnvelope(tracker, 24, (frame) => {
            const place = frame % PERIOD_FRAMES;
            if (frame < 4 * FRAME_RATE) {
                return place === 0 ? 1 : 0;
            }
            return place === 28 ? 1 : place === 0 ? 0.6 : 0;
        });
        for (let i = 1; i < run.beatTimes.length; i++) {
            expect(run.beatTimes[i] - run.beatTimes[i - 1]).toBeGreaterThan(0.5 * PERIOD);
        }
        for (const time of run.beatTimes.slice(-8)) {
            expect(distanceToPlace(time, 28)).toBeLessThan(0.03);
        }
    });

    // Indexes of the beats that came more than 0.3 of a period early or late: the moves.
    function moves(run: PhaseRun): number[] {
        const found: number[] = [];
        for (let i = 1; i < run.beatTimes.length; i++) {
            if (Math.abs(run.beatTimes[i] - run.beatTimes[i - 1] - PERIOD) > 0.3 * PERIOD) {
                found.push(i);
            }
        }
        return found;
    }

    it('waits for eight beats of evidence before the first move', () => {
        const tracker = new BeatTracker(FRAME_RATE);
        // The stronger on-beat is there from the first frame, so only the evidence minimum delays the move.
        const run = driveEnvelope(tracker, 24, (frame) => {
            const place = frame % PERIOD_FRAMES;
            return frame < 4 * FRAME_RATE ? (place === 25 ? 1 : 0) : place === 0 ? 3 : place === 25 ? 0.3 : 0;
        });
        const found = moves(run);
        expect(tracker.phaseShiftCount).toBe(1);
        expect(found).toHaveLength(1);
        expect(found[0]).toBeGreaterThanOrEqual(8);
    });

    it('does not follow a stronger place that changes sides every 12 beats', () => {
        const tracker = new BeatTracker(FRAME_RATE);
        // Every 12 beats the loud hit and the quiet hit swap places. A move keeps the evidence, so the place just left
        // has to outweigh everything heard so far, which 12 beats cannot do; clearing it would follow every swap.
        driveEnvelope(tracker, 120, (frame) => {
            const place = frame % PERIOD_FRAMES;
            const swapped = Math.floor(frame / (12 * PERIOD_FRAMES)) % 2 === 1;
            const loud = swapped ? 25 : 0;
            return place === loud ? 1 : place === 25 - loud ? 0.2 : 0;
        });
        expect(tracker.phaseShiftCount).toBeLessThanOrEqual(2);
    });

    it('forgets the phase evidence when the tempo moves an octave', () => {
        const tracker = new BeatTracker(FRAME_RATE);
        driveEnvelope(tracker, 24, offBeatStart(1, 0.6), () => phaseWins(tracker) === 3);
        expect(phaseWins(tracker)).toBe(3);
        tracker.setTempo(60);
        expect(phaseWins(tracker)).toBe(0);
    });

    // The block seen on summer2000 (hub-scorecard.md, "Tracker plan D11, S1"): the first alignment lands on the
    // off-beat, and then the summed onset keeps an off-beat layer (hats, bass at beat + 0.5) stronger than the on-beat
    // kick. The grid's own place never loses the envelope contest, so the phase check stays silent and the grid stays
    // on the off-beat, although the kick, and so the beat a listener taps, is on the other place. Envelope-only input
    // cannot tell these apart; the fix needs the worklet's kick events as a tracker input (the plan's S3). When that
    // lands, this spec passes, and `.fails` has to come off.
    it.fails('moves a grid that aligned on the off-beat onto a weaker on-beat kick (needs the kick events)', () => {
        const tracker = new BeatTracker(FRAME_RATE);
        const run = driveEnvelope(tracker, 60, offBeatStart(0.6, 1));
        // The grid really did start on the off-beat.
        expect(distanceToPlace(run.beatTimes[0], 0)).toBeGreaterThan(0.2);
        for (const time of run.beatTimes.slice(-8)) {
            expect(distanceToPlace(time, 0)).toBeLessThan(0.03);
        }
    });
});

describe('BeatTracker with unusual tempo estimates', () => {
    // Pushes `seconds` of a steady pulse train (one pulse per half second) at the tempo set beforehand.
    function pushFlat(tracker: BeatTracker, seconds: number): void {
        for (let i = 0; i < seconds * FRAME_RATE; i++) {
            tracker.push(i / FRAME_RATE, i % 50 === 0 ? 1 : 0.05);
        }
    }

    it('keeps its grid when the tempo estimate is withdrawn (0 BPM)', () => {
        const tracker = new BeatTracker(FRAME_RATE);
        drive(tracker, 120, 10);
        expect(tracker.locked).toBe(true);
        const epoch = tracker.gridEpoch;

        tracker.setTempo(0);

        expect(tracker.locked).toBe(true);
        expect(tracker.gridEpoch).toBe(epoch);
        expect(tracker.periodSeconds).toBeGreaterThan(0);
    });

    it('cannot align to a tempo faster than the frame rate resolves', () => {
        const tracker = new BeatTracker(FRAME_RATE);
        // Under two frames per beat.
        tracker.setTempo(20000);
        pushFlat(tracker, 6);
        expect(tracker.locked).toBe(false);
    });

    it('cannot align to a tempo so slow that fewer than three beats fit in the history', () => {
        const tracker = new BeatTracker(FRAME_RATE);
        // 20 BPM is a 3 s period, and the 6 s of history holds barely two of them.
        tracker.setTempo(20);
        pushFlat(tracker, 6);
        expect(tracker.locked).toBe(false);
    });

    it('still aligns when the beat period is not a whole number of frames', () => {
        const tracker = new BeatTracker(FRAME_RATE);
        // 135 BPM is 44.4 frames a beat: the comb's later pulses are rounded further out than the offsets assume, so
        // some of them fall past the stored history and are skipped.
        tracker.setTempo(135);
        pushFlat(tracker, 3.09);
        expect(tracker.locked).toBe(true);
    });
});

// Phase moves on input with no beat to find (AC10, tracker plan D11). The source comment on the phase check quotes move
// counts over 16 seeds of 120 s at 120 BPM; this is the harness that measures them, and the counts below are what the
// tracker does now. A later change to the phase check must not move more often than these.
//
// Each case yields, per frame, a pair (onset, kick). BeatTracker.push takes only the onset today, so the specs feed the
// onset alone; the kick stream is generated and kept for the tracker that takes it (plan S3), so the same harness can
// then run kick-fed against these bounds. The kick stream models the low-band share of each onset: a kick hit on a beat
// carries KICK_SHARE_ON_BEAT of its onset, every other hit KICK_SHARE_OFF_BEAT, and the floor KICK_SHARE_OFF_BEAT as
// well. Real low-band flux is correlated with the envelope in just this way: strong on drum beats, weak on hats and
// off-beat notes.
describe('BeatTracker phase moves on input with no beat', () => {
    const SEEDS = 16;
    const SECONDS = 120;
    const BEAT_FRAMES = 50;
    const FLOOR = 0.05;
    const KICK_SHARE_ON_BEAT = 0.6;
    const KICK_SHARE_OFF_BEAT = 0.1;
    // Sparse noise: about one frame in 25 holds a hit (about two per beat at 120 BPM) of random strength.
    const NOISE_HIT_PROBABILITY = 0.04;
    // Equal eighths: the off-beat layer's lean is drawn again every 16 beats.
    const LEAN_BEATS = 16;

    type CaseName = 'sparse noise' | 'equal eighths' | 'kick-only noise';

    interface Stream {
        onset: Float32Array;
        kick: Float32Array;
    }

    function generate(name: CaseName, seed: number): Stream {
        const random = createRandom(seed);
        const frames = SECONDS * FRAME_RATE;
        const onset = new Float32Array(frames);
        const kick = new Float32Array(frames);
        // A random start place, so the seeds do not all share one phase against the tracker's frame clock.
        const start = Math.floor(random() * BEAT_FRAMES);
        let lean = 1;
        for (let frame = 0; frame < frames; frame++) {
            const floor = FLOOR * (0.5 + random());
            onset[frame] = floor;
            kick[frame] = floor * KICK_SHARE_OFF_BEAT;
            if (name === 'sparse noise') {
                if (random() < NOISE_HIT_PROBABILITY) {
                    onset[frame] = 0.3 + 0.7 * random();
                    // A random hit is a kick-like hit about half of the time.
                    kick[frame] = onset[frame] * (random() < 0.5 ? KICK_SHARE_ON_BEAT : KICK_SHARE_OFF_BEAT);
                }
            } else if (name === 'equal eighths') {
                // Equal strength on every eighth note, give or take 30 percent of hit-to-hit variation and a lean of
                // the whole off-beat layer (seeded, 0.85 to 1.25 of the on-beat level, as a player leans on the "and");
                // only the ones on the beat are kicks. Exactly equal hits, or hit-to-hit variation alone, never beat
                // the grid's own place by the ratio over 20 beats of memory (no move in 16 seeds), so the harness
                // would pin nothing.
                const place = (frame + start) % (BEAT_FRAMES / 2);
                if (place === 0) {
                    const isBeat = (frame + start) % BEAT_FRAMES === 0;
                    if (isBeat && Math.floor((frame + start) / BEAT_FRAMES) % LEAN_BEATS === 0) {
                        lean = 0.85 + 0.4 * random();
                    }
                    onset[frame] = (0.7 + 0.6 * random()) * (isBeat ? 1 : lean);
                    const share = (frame + start) % BEAT_FRAMES === 0 ? KICK_SHARE_ON_BEAT : KICK_SHARE_OFF_BEAT;
                    kick[frame] = onset[frame] * share;
                }
            } else if (random() < NOISE_HIT_PROBABILITY) {
                // Random kicks over a flat envelope: no onset structure at all.
                kick[frame] = 0.3 + 0.7 * random();
            }
        }
        return { onset, kick };
    }

    function moveCount(name: CaseName, seed: number): number {
        const tracker = new BeatTracker(FRAME_RATE);
        tracker.setTempo(120);
        const { onset } = generate(name, seed);
        for (let frame = 0; frame < onset.length; frame++) {
            tracker.push(frame / FRAME_RATE, onset[frame]);
        }
        return tracker.phaseShiftCount;
    }

    function totalMoves(name: CaseName): number {
        let total = 0;
        for (let seed = 1; seed <= SEEDS; seed++) {
            total += moveCount(name, seed);
        }
        return total;
    }

    // phaseShiftCount summed over the 16 seeds, measured on main (v0.19.2) as it stands. The comment on the phase check
    // quotes 63 (sparse noise) and 15 (eighths) from an earlier, differently built generator that was not committed;
    // these streams are another draw (a sparser noise model, and eighths whose strength varies hit to hit and in a
    // lean that changes every 16 beats), so the counts differ. Only this harness's own counts can bound a change to it.
    // The kick-only case has a flat envelope, so an onset-fed tracker has nothing to move on and holds at 0.
    const MAIN_MOVES: Record<CaseName, number> = {
        'sparse noise': 31,
        'equal eighths': 3,
        'kick-only noise': 0,
    };

    it.each(Object.keys(MAIN_MOVES) as CaseName[])('moves no more than main does on %s', (name) => {
        expect(totalMoves(name)).toBeLessThanOrEqual(MAIN_MOVES[name]);
    });

    it('generates a kick stream that follows the stated share model', () => {
        const { onset, kick } = generate('equal eighths', 1);
        let onBeat = 0;
        let offBeat = 0;
        for (let frame = 0; frame < onset.length; frame++) {
            // Hits are the frames well above the floor; their kick is the on-beat or off-beat share of their onset.
            if (onset[frame] > 0.5) {
                const share = kick[frame] / onset[frame];
                if (Math.abs(share - KICK_SHARE_ON_BEAT) < 1e-4) onBeat++;
                else if (Math.abs(share - KICK_SHARE_OFF_BEAT) < 1e-4) offBeat++;
            }
        }
        expect(onBeat).toBe(offBeat);
        expect(onBeat).toBeGreaterThan(100);
        // The same seed gives the same stream.
        expect(generate('equal eighths', 1).onset).toEqual(onset);
    });
});
