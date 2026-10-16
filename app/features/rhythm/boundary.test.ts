import { describe, expect, it } from 'vitest';
import { BOUNDARY_HARD, BOUNDARY_NONE, BOUNDARY_SOFT, BoundaryDetector, type BoundaryKind } from './boundary';
import { BAND_COUNT, FRAME_CHROMA_OFFSET, FRAME_ENERGY_OFFSET, FRAME_RMS_OFFSET, FRAME_STRIDE } from './rhythmConfig';
import { createRandom } from './testSignals';

const FRAME_RATE = 100;

interface Timbre {
    energy: readonly [number, number, number];
    // Index of the pitch classes that carry the harmony.
    chroma: readonly number[];
}

const SONG_A: Timbre = { energy: [1.2, 0.9, 0.5], chroma: [0, 4, 7] };
const SONG_B: Timbre = { energy: [2.2, 1.6, 1.4], chroma: [2, 5, 9] };

interface Stream {
    detector: BoundaryDetector;
    time: number;
    frame: Float32Array;
    random: () => number;
    results: BoundaryKind[];
}

function createStream(): Stream {
    return {
        detector: new BoundaryDetector(FRAME_RATE),
        time: 0,
        frame: new Float32Array(FRAME_STRIDE),
        random: createRandom(9),
        results: [],
    };
}

// Plays `seconds` of a steady "song" (rms 0.2 with ~3% texture noise) or of silence (rms 0) through the detector.
function play(stream: Stream, seconds: number, timbre: Timbre | 'silence'): void {
    const frames = Math.round(seconds * FRAME_RATE);
    for (let i = 0; i < frames; i++) {
        const frame = stream.frame;
        frame.fill(0);
        if (timbre !== 'silence') {
            const wobble = () => 1 + (stream.random() * 2 - 1) * 0.03;
            for (let b = 0; b < BAND_COUNT; b++) {
                frame[FRAME_ENERGY_OFFSET + b] = timbre.energy[b] * wobble();
            }
            for (const pitchClass of timbre.chroma) {
                frame[FRAME_CHROMA_OFFSET + pitchClass] = wobble();
            }
            frame[FRAME_RMS_OFFSET] = 0.2;
        }
        stream.time += 1 / FRAME_RATE;
        stream.results.push(stream.detector.push(stream.time, frame, 0));
    }
}

function count(results: BoundaryKind[], kind: BoundaryKind): number {
    return results.filter((result) => result === kind).length;
}

describe('BoundaryDetector silence', () => {
    it('reports one hard boundary for silence longer than a second', () => {
        const stream = createStream();
        play(stream, 10, SONG_A);
        const before = stream.results.length;
        play(stream, 2, 'silence');
        const during = stream.results.slice(before);
        expect(count(during, BOUNDARY_HARD)).toBe(1);
        // It fires about one second into the silence, not at the first silent frame.
        const firedAt = during.indexOf(BOUNDARY_HARD) / FRAME_RATE;
        expect(firedAt).toBeGreaterThan(0.9);
        expect(firedAt).toBeLessThan(1.2);
    });

    it('does not report the same silence twice, however long it lasts', () => {
        const stream = createStream();
        play(stream, 5, SONG_A);
        play(stream, 10, 'silence');
        expect(count(stream.results, BOUNDARY_HARD)).toBe(1);
    });

    it('reports a new hard boundary for a second silence after sound returned', () => {
        const stream = createStream();
        play(stream, 5, SONG_A);
        play(stream, 2, 'silence');
        play(stream, 5, SONG_A);
        play(stream, 2, 'silence');
        expect(count(stream.results, BOUNDARY_HARD)).toBe(2);
    });

    it('ignores a 0.5 s dip', () => {
        const stream = createStream();
        play(stream, 15, SONG_A);
        play(stream, 0.5, 'silence');
        play(stream, 15, SONG_A);
        expect(count(stream.results, BOUNDARY_HARD)).toBe(0);
        expect(count(stream.results, BOUNDARY_SOFT)).toBe(0);
    });

    it('treats a dip just under a second as no boundary', () => {
        const stream = createStream();
        play(stream, 10, SONG_A);
        play(stream, 0.95, 'silence');
        play(stream, 10, SONG_A);
        expect(count(stream.results, BOUNDARY_HARD)).toBe(0);
    });
});

describe('BoundaryDetector novelty', () => {
    it('stays quiet on a steady track', () => {
        const stream = createStream();
        play(stream, 90, SONG_A);
        expect(count(stream.results, BOUNDARY_SOFT)).toBe(0);
        expect(count(stream.results, BOUNDARY_HARD)).toBe(0);
        expect(stream.detector.novelty).toBeLessThan(0.3);
    });

    it('does not judge the first seconds, which have nothing to compare with', () => {
        const stream = createStream();
        play(stream, 5, SONG_A);
        expect(stream.detector.novelty).toBe(0);
        play(stream, 5, SONG_B);
        expect(count(stream.results, BOUNDARY_SOFT)).toBe(0);
    });

    it('reports one soft boundary shortly after a strong timbre change', () => {
        const stream = createStream();
        play(stream, 30, SONG_A);
        const before = stream.results.length;
        play(stream, 20, SONG_B);
        const after = stream.results.slice(before);
        expect(count(after, BOUNDARY_SOFT)).toBe(1);
        expect(count(after, BOUNDARY_HARD)).toBe(0);
        // It should be noticed within the 6 s "recent" window.
        expect(after.indexOf(BOUNDARY_SOFT) / FRAME_RATE).toBeLessThan(6);
        // Once the old song stopped counting as "previous", the same change is not reported again.
        expect(stream.detector.novelty).toBeLessThan(1);
    });

    it('is forgotten by reset()', () => {
        const stream = createStream();
        play(stream, 30, SONG_A);
        stream.detector.reset();
        expect(stream.detector.novelty).toBe(0);
        play(stream, 5, SONG_B);
        expect(count(stream.results, BOUNDARY_SOFT)).toBe(0);
    });
});

describe('BoundaryDetector tempo cue', () => {
    function pushTempos(
        detector: BoundaryDetector,
        from: number,
        seconds: number,
        bpm: number,
        confidence = 0.8,
    ): BoundaryKind[] {
        const results: BoundaryKind[] = [];
        for (let t = from; t < from + seconds; t += 0.25) {
            results.push(detector.pushTempo(t, bpm, confidence));
        }
        return results;
    }

    it('reports a soft boundary when the tempo stays somewhere else for a few seconds', () => {
        const detector = new BoundaryDetector(FRAME_RATE);
        pushTempos(detector, 0, 10, 100);
        const results = pushTempos(detector, 10, 6, 130);
        expect(count(results, BOUNDARY_SOFT)).toBe(1);
        expect(results.indexOf(BOUNDARY_SOFT) * 0.25).toBeGreaterThanOrEqual(3);
    });

    it('ignores a brief tempo blip', () => {
        const detector = new BoundaryDetector(FRAME_RATE);
        pushTempos(detector, 0, 10, 100);
        const blip = pushTempos(detector, 10, 1.5, 130);
        const back = pushTempos(detector, 11.5, 10, 100);
        expect([...blip, ...back].every((kind) => kind === BOUNDARY_NONE)).toBe(true);
    });

    it('does not treat half or double speed as a new song', () => {
        const detector = new BoundaryDetector(FRAME_RATE);
        pushTempos(detector, 0, 10, 100);
        const half = pushTempos(detector, 10, 8, 50);
        const double = pushTempos(detector, 18, 8, 200);
        expect([...half, ...double].every((kind) => kind === BOUNDARY_NONE)).toBe(true);
    });

    it('tolerates small drifts around the reference tempo', () => {
        const detector = new BoundaryDetector(FRAME_RATE);
        const random = createRandom(2);
        let kinds: BoundaryKind[] = [];
        for (let t = 0; t < 60; t += 0.25) {
            kinds = kinds.concat(detector.pushTempo(t, 100 * (1 + (random() * 2 - 1) * 0.03), 0.8));
        }
        expect(count(kinds, BOUNDARY_SOFT)).toBe(0);
    });

    it('ignores low-confidence estimates', () => {
        const detector = new BoundaryDetector(FRAME_RATE);
        pushTempos(detector, 0, 10, 100);
        const results = pushTempos(detector, 10, 10, 150, 0.1);
        expect(count(results, BOUNDARY_SOFT)).toBe(0);
    });
});
