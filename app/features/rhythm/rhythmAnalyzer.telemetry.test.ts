import { describe, expect, it } from 'vitest';
import { RhythmAnalyzer } from './rhythmAnalyzer';
import { FRAME_FLUX_OFFSET, FRAME_STRIDE } from './rhythmConfig';

const FRAME_RATE = 100;

// Kick-band flux with a strong pulse every 50 frames (120 BPM) and a weaker one every 37.5 frames (160 BPM): the
// second pulse is a peak of the tempo autocorrelation that is not a multiple of the first.
function twoPulseFrames(seconds: number): Float32Array {
    const count = seconds * FRAME_RATE;
    const frames = new Float32Array(count * FRAME_STRIDE);
    const put = (at: number, level: number): void => {
        for (let i = 0; i < 2 && at + i < count; i++) {
            frames[(at + i) * FRAME_STRIDE + FRAME_FLUX_OFFSET] += level * (i === 0 ? 1 : 0.5);
        }
    };
    for (let at = 0; at < count; at += 50) {
        put(at, 0.1);
    }
    for (let at = 0; at < count; at += 37.5) {
        put(Math.round(at), 0.06);
    }
    return frames;
}

describe('RhythmAnalyzer rival view', () => {
    it('is 0 before any audio', () => {
        expect(new RhythmAnalyzer(FRAME_RATE).rivalBpm).toBe(0);
    });

    it('shows the strongest unrelated pulse next to the raw and held tempo, and a hard reset clears it', () => {
        const analyzer = new RhythmAnalyzer(FRAME_RATE);

        analyzer.pushBatch(0, twoPulseFrames(20), 20 * FRAME_RATE);

        expect(analyzer.rawTempoBpm).toBeGreaterThan(0);
        expect(analyzer.rivalBpm).toBeGreaterThan(0);
        // A rival is a different tempo, not the winner or one of its multiples.
        expect(Math.abs(analyzer.rivalBpm / analyzer.rawTempoBpm - 1)).toBeGreaterThan(0.1);

        analyzer.hardReset(false);

        expect(analyzer.rivalBpm).toBe(0);
        expect(analyzer.rawTempoBpm).toBe(0);
    });
});
