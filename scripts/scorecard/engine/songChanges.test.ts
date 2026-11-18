import { describe, expect, it } from 'vitest';
import { renderTrack, TEST_SAMPLE_RATE } from '../../../app/features/rhythm/testSignals';
import { countUnexplainedChanges, findSilences, recordSongChanges } from './songChanges';
import { replayPcm } from './replay';

describe('findSilences', () => {
    it('finds stretches of at least a second of digital silence', () => {
        const pcm = new Float32Array(10 * 1000).fill(0.5);
        pcm.fill(0, 2000, 3500); // 1.5 s
        pcm.fill(0, 5000, 5500); // 0.5 s, too short
        pcm.fill(0.00005, 7000, 10000); // below the threshold, up to the end
        expect(findSilences(pcm, 1000)).toEqual([
            { start: 2, end: 3.5 },
            { start: 7, end: 10 },
        ]);
    });
});

describe('countUnexplainedChanges', () => {
    const silences = [{ start: 5, end: 7 }];

    it('excuses changes during or within a second after a silence', () => {
        expect(countUnexplainedChanges([{ time: 6 }, { time: 7.9 }], silences)).toBe(0);
    });

    it('counts the others', () => {
        expect(countUnexplainedChanges([{ time: 4.9 }, { time: 8.1 }], silences)).toBe(2);
    });
});

describe('recordSongChanges', () => {
    it('records nothing on a steady track', () => {
        const click = renderTrack({ seconds: 8, bpm: 120, beatsPerBar: 4 });
        const { events } = recordSongChanges(() => replayPcm(click.pcm, TEST_SAMPLE_RATE));
        expect(events).toEqual([]);
    });

    it('puts the analyzer back even when the run throws', () => {
        expect(() =>
            recordSongChanges(() => {
                throw new Error('boom');
            }),
        ).toThrow('boom');
    });
});
