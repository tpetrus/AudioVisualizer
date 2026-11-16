import { describe, expect, it } from 'vitest';
import {
    TEMPO_LOCK_CONFIDENCE,
    TEMPO_MIN_HISTORY_SECONDS,
    TEMPO_TIE_MAX_DEFER_S,
    TEMPO_UPDATE_SECONDS,
} from './rhythmConfig';
import { isSyncopationRatio, TempoTracker } from './tempo';
import { createRandom } from './testSignals';

const FRAME_RATE = 100;
const UPDATE_FRAMES = Math.round(TEMPO_UPDATE_SECONDS * FRAME_RATE);

// An onset-envelope pulse train: a sharp pulse with a short decay at each beat, with optional per-beat jitter in frames.
function pulseTrain(bpm: number, seconds: number, jitterFrames = 0, seed = 7, startFrame = 0): Float32Array {
    const frames = Math.round(seconds * FRAME_RATE);
    const envelope = new Float32Array(frames);
    const random = createRandom(seed);
    const period = (60 / bpm) * FRAME_RATE;
    for (let beat = 0; ; beat++) {
        const jitter = jitterFrames > 0 ? Math.round((random() * 2 - 1) * jitterFrames) : 0;
        const at = Math.round(startFrame + beat * period) + jitter;
        if (at >= frames) {
            break;
        }
        if (at < 0) {
            continue;
        }
        envelope[at] += 1;
        if (at + 1 < frames) {
            envelope[at + 1] += 0.5;
        }
        if (at + 2 < frames) {
            envelope[at + 2] += 0.2;
        }
    }
    return envelope;
}

interface Trace {
    bpm: number[];
    updated: boolean[];
}

// Pushes the envelope and asks for an estimate every update interval, recording the held tempo each time.
function drive(tracker: TempoTracker, envelope: Float32Array): Trace {
    const trace: Trace = { bpm: [], updated: [] };
    for (let i = 0; i < envelope.length; i++) {
        tracker.push(envelope[i]);
        if ((i + 1) % UPDATE_FRAMES === 0) {
            trace.updated.push(tracker.update());
            trace.bpm.push(tracker.bpm);
        }
    }
    return trace;
}

describe('TempoTracker', () => {
    // 160 and 180 BPM used to come out at half speed; the faster-pulse preference and envelope smoothing in tempo.ts
    // fixed that, and these keep it fixed.
    it.each([70, 80, 90, 100, 110, 120, 130, 140, 150, 160, 170, 180])('finds %i BPM within 4%%', (bpm) => {
        const tracker = new TempoTracker(FRAME_RATE);
        drive(tracker, pulseTrain(bpm, 20));
        expect(Math.abs(tracker.bpm / bpm - 1)).toBeLessThan(0.04);
        expect(tracker.confidence).toBeGreaterThan(0.3);
    });

    it.each([160, 180])('finds %i BPM up to an octave', (bpm) => {
        const tracker = new TempoTracker(FRAME_RATE);
        drive(tracker, pulseTrain(bpm, 20));
        const ratio = tracker.bpm / bpm;
        expect(Math.min(Math.abs(ratio - 1), Math.abs(ratio - 0.5), Math.abs(ratio - 2))).toBeLessThan(0.04);
    });

    it('finds the tempo to better than 1% with the comb refinement', () => {
        const tracker = new TempoTracker(FRAME_RATE);
        // 117 BPM does not fall on a whole number of frames (51.28), so only the refinement gets it exact.
        drive(tracker, pulseTrain(117, 20));
        expect(Math.abs(tracker.bpm / 117 - 1)).toBeLessThan(0.01);
    });

    it('does not take a sparse train at half speed for the pulse rate when every beat is present', () => {
        // Every beat is a full pulse, so half and double speed are equally periodic. The prior and the double-lag
        // term must still pick the real beat rate for these mid-range tempos (no octave error expected).
        for (const bpm of [100, 120, 140]) {
            const tracker = new TempoTracker(FRAME_RATE);
            drive(tracker, pulseTrain(bpm, 20));
            expect(tracker.bpm / bpm).toBeCloseTo(1, 1);
        }
    });

    it('returns false from update() with under 3 s of history and true afterwards', () => {
        const tracker = new TempoTracker(FRAME_RATE);
        const envelope = pulseTrain(120, 4);
        const minFrames = TEMPO_MIN_HISTORY_SECONDS * FRAME_RATE;
        for (let i = 0; i < minFrames - 1; i++) {
            tracker.push(envelope[i]);
            expect(tracker.update()).toBe(false);
        }
        expect(tracker.bpm).toBe(0);
        tracker.push(envelope[minFrames - 1]);
        expect(tracker.update()).toBe(true);
    });

    it('holds the tempo steady under small timing jitter', () => {
        const tracker = new TempoTracker(FRAME_RATE);
        const trace = drive(tracker, pulseTrain(120, 40, 1));
        // After the first lock, the held tempo must not wander by more than the hysteresis band.
        const settled = trace.bpm.slice(Math.round(10 / TEMPO_UPDATE_SECONDS));
        expect(Math.min(...settled)).toBeGreaterThan(0);
        expect(Math.max(...settled) / Math.min(...settled)).toBeLessThan(1.04);
        expect(Math.abs(tracker.bpm / 120 - 1)).toBeLessThan(0.04);
    });

    it('follows a tempo change', () => {
        const tracker = new TempoTracker(FRAME_RATE);
        const slow = pulseTrain(100, 20);
        const fast = pulseTrain(140, 25);
        drive(tracker, slow);
        expect(Math.abs(tracker.bpm / 100 - 1)).toBeLessThan(0.04);
        drive(tracker, fast);
        expect(Math.abs(tracker.bpm / 140 - 1)).toBeLessThan(0.04);
    });

    it('follows a gradual tempo ramp', () => {
        const tracker = new TempoTracker(FRAME_RATE);
        const frames = 40 * FRAME_RATE;
        const envelope = new Float32Array(frames);
        let at = 0;
        while (at < frames) {
            envelope[at] = 1;
            const bpm = 100 + (120 - 100) * (at / frames);
            at += Math.round((60 / bpm) * FRAME_RATE);
        }
        drive(tracker, envelope);
        // The ramp ends at 120 BPM; the history window averages the last 8 s, which sit at about 117-120.
        expect(Math.abs(tracker.bpm / 118 - 1)).toBeLessThan(0.05);
    });

    it('reports no tempo for silence and for a constant envelope', () => {
        const silent = new TempoTracker(FRAME_RATE);
        drive(silent, new Float32Array(10 * FRAME_RATE));
        expect(silent.bpm).toBe(0);
        expect(silent.confidence).toBe(0);

        const flat = new TempoTracker(FRAME_RATE);
        drive(flat, new Float32Array(10 * FRAME_RATE).fill(0.5));
        expect(flat.bpm).toBe(0);
    });

    it('is much less confident about noise than about a pulse train', () => {
        const random = createRandom(3);
        const noise = new Float32Array(15 * FRAME_RATE);
        for (let i = 0; i < noise.length; i++) {
            noise[i] = random();
        }
        const noisy = new TempoTracker(FRAME_RATE);
        drive(noisy, noise);
        const rhythmic = new TempoTracker(FRAME_RATE);
        drive(rhythmic, pulseTrain(120, 15));
        expect(noisy.confidence).toBeLessThan(0.5 * rhythmic.confidence);
    });

    it('drops the tempo after a long stretch of silence', () => {
        const tracker = new TempoTracker(FRAME_RATE);
        drive(tracker, pulseTrain(120, 15));
        expect(tracker.bpm).toBeGreaterThan(0);
        drive(tracker, new Float32Array(25 * FRAME_RATE));
        expect(tracker.bpm).toBe(0);
    });

    it('keepRecent() and reset() forget the past', () => {
        const tracker = new TempoTracker(FRAME_RATE);
        drive(tracker, pulseTrain(120, 15));
        tracker.keepRecent(1);
        expect(tracker.update()).toBe(false);

        tracker.reset();
        expect(tracker.bpm).toBe(0);
        expect(tracker.rawBpm).toBe(0);
        expect(tracker.confidence).toBe(0);
        expect(tracker.update()).toBe(false);
    });
});

describe('TempoTracker on a syncopated pattern', () => {
    function concatenated(...parts: Float32Array[]): Float32Array {
        const out = new Float32Array(parts.reduce((total, part) => total + part.length, 0));
        let offset = 0;
        for (const part of parts) {
            out.set(part, offset);
            offset += part.length;
        }
        return out;
    }

    // Dotted notes make a pulse 4/3 of the true tempo for a few bars (measured on a real syncopated bassline, 98 and 130.7
    // BPM). The tempo has not changed, so the held value must not follow it.
    it('keeps the held tempo through a few seconds of a 4/3 pulse', () => {
        const tracker = new TempoTracker(FRAME_RATE);
        const trace = drive(tracker, concatenated(pulseTrain(98, 15), pulseTrain(98 * (4 / 3), 6), pulseTrain(98, 6)));
        for (const bpm of trace.bpm.slice(Math.round(10 / TEMPO_UPDATE_SECONDS))) {
            expect(Math.abs(bpm / 98 - 1)).toBeLessThan(0.02);
        }
    });

    // The same pulse seen from a faster held tempo. 160 is a tempo the octave prior keeps; a bare 196 now reads 98 by design.
    it('keeps a held double-time tempo through a 2/3 pulse', () => {
        const tracker = new TempoTracker(FRAME_RATE);
        const trace = drive(
            tracker,
            concatenated(pulseTrain(160, 15), pulseTrain(160 * (2 / 3), 6), pulseTrain(160, 6)),
        );
        for (const bpm of trace.bpm.slice(Math.round(10 / TEMPO_UPDATE_SECONDS))) {
            expect(Math.abs(bpm / 160 - 1)).toBeLessThan(0.02);
        }
    });

    it.each([
        [130.67, 98, true],
        [98, 130.67, true],
        [130.67, 196, true],
        [196, 130.67, true],
        [98, 196, false],
        [140, 100, false],
        [100, 100, false],
    ])('classifies %f against %f as dotted: %s', (bpm, reference, expected) => {
        expect(isSyncopationRatio(bpm, reference)).toBe(expected);
    });

    it('still follows a 4/3 tempo that lasts', () => {
        const tracker = new TempoTracker(FRAME_RATE);
        const trace = drive(tracker, concatenated(pulseTrain(98, 15), pulseTrain(98 * (4 / 3), 25)));
        expect(Math.abs(trace.bpm[trace.bpm.length - 1] / (98 * (4 / 3)) - 1)).toBeLessThan(0.02);
    });

    it('follows a change at another ratio much sooner than a 4/3 pulse', () => {
        const settle = (next: number) => {
            const trace = drive(new TempoTracker(FRAME_RATE), concatenated(pulseTrain(98, 15), pulseTrain(next, 25)));
            const index = trace.bpm.findIndex(
                (bpm, i) => i * TEMPO_UPDATE_SECONDS >= 15 && Math.abs(bpm / next - 1) < 0.02,
            );
            expect(index).toBeGreaterThan(0);
            return index * TEMPO_UPDATE_SECONDS;
        };
        expect(settle(140)).toBeLessThan(settle(98 * (4 / 3)));
    });
});

describe('TempoTracker rival view', () => {
    // Two pulse trains at once: the louder one wins, the weaker one is a rival that is not a multiple of it. The rival is
    // not 4:3 of the winner (160 was): an exact 4:3 mix is a polyrhythm whose bar evidence truly favors the faster pulse.
    function twoPulses(seconds: number): Float32Array {
        const strong = pulseTrain(120, seconds);
        const weak = pulseTrain(150, seconds);
        return strong.map((value, i) => value + 0.6 * weak[i]);
    }

    it('is 0 before any estimate and on a clean pulse train that has no unrelated peak', () => {
        const tracker = new TempoTracker(FRAME_RATE);
        expect(tracker.rivalBpm).toBe(0);

        drive(tracker, pulseTrain(120, 20));

        expect(tracker.rawBpm).toBeCloseTo(120, 0);
        expect(tracker.rivalBpm).toBe(0);
    });

    it('reports the strongest peak that is not a multiple or fraction of the winner', () => {
        const tracker = new TempoTracker(FRAME_RATE);

        drive(tracker, twoPulses(20));

        expect(tracker.rawBpm).toBeCloseTo(120, 0);
        expect(tracker.rivalBpm).toBeGreaterThan(0);
        // Whole multiples of the winner's lag are the same pulse, so the rival is a different tempo.
        const ratio = tracker.rivalBpm / tracker.rawBpm;
        expect([1, 2, 3, 4, 1 / 2, 1 / 3, 1 / 4].some((multiple) => Math.abs(ratio / multiple - 1) < 0.1)).toBe(false);
    });

    it('does not change the tempo decision: the held tempo is the same with and without a rival peak', () => {
        const withRival = new TempoTracker(FRAME_RATE);
        const alone = new TempoTracker(FRAME_RATE);

        drive(withRival, twoPulses(20));
        drive(alone, pulseTrain(120, 20));

        expect(withRival.bpm).toBeCloseTo(alone.bpm, 0);
    });

    it('is cleared by reset', () => {
        const tracker = new TempoTracker(FRAME_RATE);
        drive(tracker, twoPulses(20));
        expect(tracker.rivalBpm).toBeGreaterThan(0);

        tracker.reset();

        expect(tracker.rivalBpm).toBe(0);
    });

    it('is cleared by an estimate with no usable peak', () => {
        const tracker = new TempoTracker(FRAME_RATE);
        drive(tracker, twoPulses(20));
        expect(tracker.rivalBpm).toBeGreaterThan(0);

        // A full history of silence has no energy, so the estimate has nothing to rank.
        drive(tracker, new Float32Array(10 * FRAME_RATE));

        expect(tracker.rawBpm).toBe(0);
        expect(tracker.rivalBpm).toBe(0);
    });
});

// A bar of 180 frames (1.8 s) with the beat every 45 frames (133 BPM, at `beat` weight) and a dotted pulse every 60 frames
// (100 BPM, at weight 1). Over 3 s the two score about the same, but only the beat repeats every 4 beats, so only its 4x
// and 8x lags (the bar and two bars) are in phase.
function dottedBar(seconds: number, beat: number): Float32Array {
    const frames = Math.round(seconds * FRAME_RATE);
    const envelope = new Float32Array(frames);
    const hits = [
        [0, 1],
        [60, 1],
        [120, 1],
        [45, beat],
        [90, beat],
        [135, beat],
    ];
    for (let bar = 0; bar * 180 < frames; bar++) {
        for (const [offset, weight] of hits) {
            if (bar * 180 + offset < frames) {
                envelope[bar * 180 + offset] += weight;
            }
        }
    }
    return envelope;
}

interface TieTrace {
    // Seconds of the first update that published a tempo and of the first that deferred (undefined if none did).
    published?: number;
    firstDeferred?: number;
    bpm: number;
    publishedWhileDeferring: boolean;
}

// Pushes the envelope with an estimate every update interval, recording when the tie opened and when a tempo appeared.
function driveTie(tracker: TempoTracker, envelope: Float32Array): TieTrace {
    const trace: TieTrace = { bpm: 0, publishedWhileDeferring: false };
    for (let i = 0; i < envelope.length; i++) {
        tracker.push(envelope[i]);
        if ((i + 1) % UPDATE_FRAMES !== 0 || !tracker.update()) {
            continue;
        }
        const time = (i + 1) / FRAME_RATE;
        if (tracker.deferring) {
            trace.firstDeferred ??= time;
            trace.publishedWhileDeferring ||= tracker.bpm > 0;
        }
        if (tracker.bpm > 0) {
            trace.published ??= time;
        }
    }
    trace.bpm = tracker.bpm;
    return trace;
}

function openTie(seconds: number): TempoTracker {
    const tracker = new TempoTracker(FRAME_RATE);
    const envelope = dottedBar(seconds, 0.6);
    for (let i = 0; i < envelope.length; i++) {
        tracker.push(envelope[i]);
        if ((i + 1) % UPDATE_FRAMES === 0) {
            tracker.update();
        }
    }
    return tracker;
}

describe('TempoTracker first-lock tie', () => {
    it('holds the lock back on a dotted tie and moves to the pulse that repeats every bar', () => {
        const tracker = new TempoTracker(FRAME_RATE);
        const trace = driveTie(tracker, dottedBar(12, 0.6));

        // The dotted pulse (100 BPM) wins the estimate, but nothing is published until the bar-repeat comparison.
        expect(trace.firstDeferred).toBeCloseTo(3, 1);
        expect(trace.publishedWhileDeferring).toBe(false);
        expect(trace.published).toBeGreaterThan(7);
        expect(Math.abs(trace.bpm / 133.33 - 1)).toBeLessThan(0.02);
        expect(tracker.deferring).toBe(false);
    });

    it('keeps publishing the estimate and its confidence while the tie is open', () => {
        const tracker = openTie(5);

        expect(tracker.deferring).toBe(true);
        expect(tracker.bpm).toBe(0);
        expect(tracker.rawBpm).toBeGreaterThan(0);
        expect(tracker.confidence).toBeGreaterThanOrEqual(TEMPO_LOCK_CONFIDENCE);
    });

    it('keeps the winner when the rival bar repeat is not clearly better (a draw)', () => {
        const trace = driveTie(new TempoTracker(FRAME_RATE), dottedBar(12, 0.9));

        // With the beat nearly as strong as the dotted pulse the beat wins the estimate and the rival does not beat it.
        expect(trace.firstDeferred).toBeDefined();
        expect(Math.abs(trace.bpm / 133.33 - 1)).toBeLessThan(0.02);
    });

    it('publishes the winner when the deadline passes, within TEMPO_TIE_MAX_DEFER_S of the first deferral', () => {
        for (const beat of [0.6, 0.9]) {
            const trace = driveTie(new TempoTracker(FRAME_RATE), dottedBar(12, beat));
            const waited = trace.published! - trace.firstDeferred!;

            expect(waited).toBeLessThanOrEqual(TEMPO_TIE_MAX_DEFER_S + TEMPO_UPDATE_SECONDS);
            expect(waited).toBeGreaterThanOrEqual(TEMPO_TIE_MAX_DEFER_S - TEMPO_UPDATE_SECONDS);
        }
    });

    it('locks at once, with no deferral, when there is no dotted rival', () => {
        const trace = driveTie(new TempoTracker(FRAME_RATE), pulseTrain(120, 12));

        expect(trace.firstDeferred).toBeUndefined();
        expect(trace.published).toBeLessThanOrEqual(3.25);
    });

    it('locks at once when the dotted rival is far weaker than the winner (under TEMPO_TIE_MIN_RATIO)', () => {
        const trace = driveTie(new TempoTracker(FRAME_RATE), dottedBar(12, 0.3));

        expect(trace.firstDeferred).toBeUndefined();
        expect(trace.published).toBeLessThanOrEqual(3.25);
    });

    it('is cleared by reset() and by keepRecent()', () => {
        for (const clear of [(t: TempoTracker) => t.reset(), (t: TempoTracker) => t.keepRecent(1)]) {
            const tracker = openTie(4);
            expect(tracker.deferring).toBe(true);

            clear(tracker);

            expect(tracker.deferring).toBe(false);
            expect(tracker.bpm).toBe(0);
        }
    });

    it('closes the tie when the confidence drops under the lock threshold', () => {
        const tracker = openTie(3.5);
        expect(tracker.deferring).toBe(true);

        // One huge onset dwarfs the pattern's energy, so no periodicity is left and there is nothing to decide.
        tracker.push(1000);
        tracker.update();

        expect(tracker.confidence).toBeLessThan(TEMPO_LOCK_CONFIDENCE);
        expect(tracker.deferring).toBe(false);
        expect(tracker.bpm).toBe(0);
    });
});

// A trace that also keeps the unfiltered estimate, so a spec can show which rule kept the held value where it was.
interface RawTrace extends Trace {
    raw: number[];
}

function driveRaw(tracker: TempoTracker, envelope: Float32Array): RawTrace {
    const trace: RawTrace = { bpm: [], updated: [], raw: [] };
    for (let i = 0; i < envelope.length; i++) {
        tracker.push(envelope[i]);
        if ((i + 1) % UPDATE_FRAMES === 0) {
            trace.updated.push(tracker.update());
            trace.bpm.push(tracker.bpm);
            trace.raw.push(tracker.rawBpm);
        }
    }
    return trace;
}

describe('TempoTracker octave and bar rules', () => {
    function joined(...parts: Float32Array[]): Float32Array {
        const out = new Float32Array(parts.reduce((total, part) => total + part.length, 0));
        let offset = 0;
        for (const part of parts) {
            out.set(part, offset);
            offset += part.length;
        }
        return out;
    }

    function weighted(envelope: Float32Array, weight: number): Float32Array {
        return envelope.map((value) => value * weight);
    }

    function added(a: Float32Array, b: Float32Array): Float32Array {
        return a.map((value, i) => value + b[i]);
    }

    // A 4/4 bar of four beats that repeats exactly, plus a dotted-eighth figure (a hit every 0.75 beat, restarting each
    // bar) from bar `fromBar` on. The figure makes a 4:3 pulse, 180 BPM at a 135 BPM beat.
    function dottedBars(bpm: number, seconds: number, fromBar: number, figure: number, beatWeight = 1): Float32Array {
        const beatFrames = (60 / bpm) * FRAME_RATE;
        const envelope = new Float32Array(Math.round(seconds * FRAME_RATE));
        const hit = (at: number, weight: number) => {
            const frame = Math.round(at);
            if (frame < envelope.length) {
                envelope[frame] += weight;
                envelope[frame + 1] += weight * 0.5;
                envelope[frame + 2] += weight * 0.2;
            }
        };
        for (let bar = 0; bar * 4 * beatFrames < envelope.length; bar++) {
            for (let beat = 0; beat < 4; beat++) {
                hit((bar * 4 + beat) * beatFrames, beatWeight);
            }
            if (bar >= fromBar) {
                for (let k = 0; k * 0.75 < 4; k++) {
                    hit((bar * 4 + k * 0.75) * beatFrames, figure);
                }
            }
        }
        return envelope;
    }

    // Every held value once a tempo is held, so a spec covers the whole run and not just its last update.
    function heldValues(trace: Trace): number[] {
        return trace.bpm.filter((bpm) => bpm > 0);
    }

    function longestRun(values: boolean[]): number {
        let longest = 0;
        let run = 0;
        for (const value of values) {
            run = value ? run + 1 : 0;
            longest = Math.max(longest, run);
        }
        return longest;
    }

    describe('octave prior toward the faster pulse', () => {
        // The divisor-2 branch in update(): without the octave prior on interpolated heights, the 87 BPM half-lag peak
        // (which sits on whole frames) beats the 174 BPM peak (34.48 frames, split over two lags).
        it('holds a bare 174 BPM pulse at 174, not 87', () => {
            const held = heldValues(drive(new TempoTracker(FRAME_RATE), pulseTrain(174, 30)));
            expect(held.length).toBeGreaterThan(0);
            for (const bpm of held) {
                expect(Math.abs(bpm / 174 - 1)).toBeLessThan(0.02);
            }
        });

        // The 0.3 weight is a case the divisor-2 branch alone decides: without it the 70 BPM pulse wins.
        it.each([0.5, 0.3])('holds full pulses at 70 BPM with %f-strength pulses at 140 at 140', (strength) => {
            const envelope = added(pulseTrain(70, 30), weighted(pulseTrain(140, 30), strength));
            const held = heldValues(drive(new TempoTracker(FRAME_RATE), envelope));
            expect(held.length).toBeGreaterThan(0);
            for (const bpm of held) {
                expect(Math.abs(bpm / 140 - 1)).toBeLessThan(0.02);
            }
        });
    });

    describe('pulses above the octave break-even', () => {
        // A pulse faster than the octave prior's break-even (185 BPM) is a subdivision of the pulse at half its tempo. For a
        // bare pulse train the main prior and its double-lag bonus already put the winner on the slower pulse, and the
        // faster-pulse takeover must not undo that under the octave prior.
        it.each([
            [196, 98],
            [200, 100],
        ])('folds a bare %f BPM pulse to %f', (bpm, expected) => {
            const held = heldValues(drive(new TempoTracker(FRAME_RATE), pulseTrain(bpm, 30)));
            expect(held.length).toBeGreaterThan(0);
            for (const value of held) {
                expect(Math.abs(value / expected - 1)).toBeLessThan(0.02);
            }
        });
    });

    describe('octave-away hold', () => {
        // syncopationbass loses its 98 pulse for about 2.5 s and reads 196. A bare 196 pulse folds to 98 in the raw estimate
        // (the spec above), so the middle section is made loud enough that the 196 pulse outweighs the 98 pulses
        // still in the 8 s window, and the raw estimate does read 196 for four updates in a row. That is as many as
        // TEMPO_SWITCH_ESTIMATES asks for, so only the octave-away rule (which asks for TEMPO_SYNCOPATION_SWITCH_ESTIMATES
        // and the confidence it demands) keeps the held tempo at 98.
        // The hold is for moves up only. A first lock on the subdivision (a real 81 BPM track read as 162 for its first
        // seconds) must correct itself as fast as any other change once the slower pulse wins the estimate.
        it('follows an octave move down within three seconds', () => {
            const trace = driveRaw(new TempoTracker(FRAME_RATE), joined(pulseTrain(162, 12), pulseTrain(81, 20)));
            const held = trace.bpm;
            const before = held[Math.round(11 / TEMPO_UPDATE_SECONDS)];
            expect(Math.abs(before / 162 - 1)).toBeLessThan(0.02);
            const firstRaw = trace.raw.findIndex(
                (bpm, k) => k * TEMPO_UPDATE_SECONDS > 12 && Math.abs(bpm / 81 - 1) < 0.02,
            );
            expect(firstRaw).toBeGreaterThan(0);
            const followed = held.findIndex((bpm, k) => k >= firstRaw && Math.abs(bpm / 81 - 1) < 0.02);
            expect(followed).toBeGreaterThan(0);
            expect((followed - firstRaw) * TEMPO_UPDATE_SECONDS).toBeLessThan(3);
        });

        it('keeps the held 98 through 2.5 s whose raw estimate reads 196', () => {
            const tracker = new TempoTracker(FRAME_RATE);
            const envelope = joined(pulseTrain(98, 15), weighted(pulseTrain(196, 2.5), 100), pulseTrain(98, 10));
            const trace = driveRaw(tracker, envelope);
            const readsDouble = trace.raw.map((bpm) => Math.abs(bpm / 196 - 1) < 0.03);
            expect(longestRun(readsDouble)).toBeGreaterThanOrEqual(4);
            for (const bpm of trace.bpm.slice(Math.round(10 / TEMPO_UPDATE_SECONDS))) {
                expect(Math.abs(bpm / 98 - 1)).toBeLessThan(0.02);
            }
        });
    });

    describe('bar evidence', () => {
        // The allow side of barFavors is covered by "still follows a 4/3 tempo that lasts" above: a 98 BPM pulse that
        // becomes a real 4/3 tempo is followed although the 8x lag at 98 BPM is out of reach, so only the 4x lag is
        // compared there and the new pulse wins it. This is the veto side.
        it('does not follow a dotted figure that restarts every bar', () => {
            // A 135 BPM bar of four beats with a louder dotted-eighth figure from bar 7 on (about 12.4 s). The figure makes
            // 180 BPM the strongest pulse of the raw estimate, but the beat repeats every bar and the figure's 4:3 pulse
            // does not, so the bar evidence keeps the held tempo.
            const tracker = new TempoTracker(FRAME_RATE);
            const trace = driveRaw(tracker, dottedBars(135, 42.5, 7, 2));
            const held = heldValues(trace);
            expect(held.length).toBeGreaterThan(0);
            for (const bpm of held) {
                expect(Math.abs(bpm / 135 - 1)).toBeLessThan(0.02);
            }
            const readsDotted = trace.raw.map((bpm) => Math.abs(bpm / 180 - 1) < 0.02);
            expect(longestRun(readsDotted)).toBeGreaterThanOrEqual(32);
        });
    });
});
