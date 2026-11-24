import { describe, expect, it } from 'vitest';
import { correlateWindow, estimateTempo, firstLockRivalBpm, tempoGeometry } from './autocorrelation';
import { findFirstLock, replayTracker } from './probe';

const FRAME_RATE = 100;

// A bar of four beats every 36 frames (167 BPM, at `beat` weight) with a pulse every 54 frames (111 BPM, at weight 1) that
// restarts each bar. The 111 pulse wins the estimate and has no dotted rival; the beat is its 3:2 faster neighbor, and
// only the beat repeats every bar.
function fasterBar(seconds: number, beat: number): Float32Array {
    const frames = Math.round(seconds * FRAME_RATE);
    const envelope = new Float32Array(frames);
    for (let bar = 0; bar * 144 < frames; bar++) {
        for (let k = 0; k < 4; k++) {
            if (bar * 144 + k * 36 < frames) {
                envelope[bar * 144 + k * 36] += beat;
            }
            if (k < 3 && bar * 144 + k * 54 < frames) {
                envelope[bar * 144 + k * 54] += 1;
            }
        }
    }
    return envelope;
}

// The tracker's first lock on the envelope, and what the mirror says about the window it decided on.
function firstLock(beat: number) {
    const envelope = fasterBar(14, beat);
    const lock = findFirstLock(replayTracker(envelope, FRAME_RATE))!;
    const geometry = tempoGeometry(FRAME_RATE);
    const window = correlateWindow(envelope, lock.frames, geometry)!;
    const estimate = estimateTempo(window, geometry);
    return { lock, estimate, rival: firstLockRivalBpm(window, estimate, geometry) };
}

describe('firstLockRivalBpm with the 3:2 faster rival', () => {
    it('takes the faster pulse the tracker takes when its comb score reaches the default ratio', () => {
        const { lock, estimate, rival } = firstLock(0.4);

        // The tracker holds the first lock back while the bar sums are not in reach, then publishes the beat.
        expect(lock.time).toBeCloseTo(8, 2);
        expect(estimate.bpm).toBeCloseTo(111.11, 1);
        expect(rival).toBeCloseTo(166.7, 1);
        expect(lock.raw).toBeCloseTo(rival!, 6);
    });

    it('leaves the winner alone when the faster comb score is under the ratio', () => {
        const { lock, estimate, rival } = firstLock(0.2);

        expect(lock.time).toBeCloseTo(3, 2);
        expect(rival).toBeUndefined();
        expect(lock.raw).toBeCloseTo(estimate.bpm, 6);
    });
});
