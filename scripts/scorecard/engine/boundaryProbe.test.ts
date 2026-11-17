import { describe, expect, it } from 'vitest';
import { BoundaryDetector } from '../../../app/features/rhythm/boundary';
import { TEST_SAMPLE_RATE, concat, renderTrack } from '../../../app/features/rhythm/testSignals';
import { countSoftBoundaries } from './boundaryProbe';
import { replayPcm } from './replay';

describe('countSoftBoundaries', () => {
    it('counts the soft boundary of a real tempo change and puts the detector back', () => {
        const push = BoundaryDetector.prototype.push;
        const pushTempo = BoundaryDetector.prototype.pushTempo;
        // 100 to 170 bpm is neither an octave nor a dotted ratio, so the tracker raises one soft boundary.
        const pcm = concat(
            renderTrack({ seconds: 24, bpm: 100, beatsPerBar: 4 }).pcm,
            renderTrack({ seconds: 30, bpm: 170, beatsPerBar: 4, clickHz: 2200 }).pcm,
        );
        const replay = replayPcm(pcm, TEST_SAMPLE_RATE);
        expect(replay.softBoundaries).toBe(1);
        expect(replay.songChangeCount).toBe(1);
        expect(BoundaryDetector.prototype.push).toBe(push);
        expect(BoundaryDetector.prototype.pushTempo).toBe(pushTempo);
    });

    it('restores the detector when the run throws', () => {
        const push = BoundaryDetector.prototype.push;
        expect(() =>
            countSoftBoundaries(() => {
                throw new Error('boom');
            }),
        ).toThrow('boom');
        expect(BoundaryDetector.prototype.push).toBe(push);
    });

    it('reports the result of the run', () => {
        expect(countSoftBoundaries(() => 5)).toEqual({ result: 5, softBoundaries: 0 });
    });
});
