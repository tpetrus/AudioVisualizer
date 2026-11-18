import { describe, expect, it } from 'vitest';
import { TEST_SAMPLE_RATE } from '../../../app/features/rhythm/testSignals';
import {
    SCENARIO_DOTTED_PASSAGE,
    SCENARIO_DOTTED_SONG_CHANGE,
    dottedPassagePcm,
    dottedSongChangePcm,
    measureScenarios,
} from './scenarios';

describe('scenario audio', () => {
    it('builds the dotted song change from two tempos with no gap', () => {
        expect(dottedSongChangePcm().length).toBe(60 * TEST_SAMPLE_RATE);
    });

    it('builds the dotted passage as one steady song', () => {
        expect(dottedPassagePcm().length).toBe(60 * TEST_SAMPLE_RATE);
    });
});

describe('measureScenarios', () => {
    const measures = measureScenarios();

    it('reports both AC9 cases by id', () => {
        expect(measures.map((m) => m.id)).toEqual([SCENARIO_DOTTED_SONG_CHANGE, SCENARIO_DOTTED_PASSAGE]);
    });

    it('observes soft boundaries, which are a part of the song changes', () => {
        for (const m of measures) {
            expect(m.softBoundaries).toBeGreaterThanOrEqual(0);
            expect(m.songChanges).toBeGreaterThanOrEqual(m.softBoundaries);
        }
    });

    it('is deterministic', () => {
        expect(measureScenarios()).toEqual(measures);
    });
});
