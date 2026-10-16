import { describe, expect, it } from 'vitest';
import { TEMPO_MIN_HISTORY_SECONDS, TEMPO_UPDATE_SECONDS } from './rhythmConfig';
import { TempoTracker } from './tempo';
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
