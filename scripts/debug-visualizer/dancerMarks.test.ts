import { describe, expect, it } from 'vitest';
import type { TelemetryTable } from '../../app/features/audio/devTelemetrySummary';
import { dancerMarksLines } from './dancerMarks';

describe('dancerMarksLines', () => {
    it('prints the last row of the dancer columns, with the marks in seconds on the recording clock', () => {
        const table: TelemetryTable = {
            columns: [
                't',
                'dancing-character.placedKicks',
                'dancing-character.phaseOnsets',
                'dancing-character.sceneBuiltAt',
                'dancing-character.modelParsedAt',
            ],
            rows: [
                [0, 0, 0, -3.1234, NaN],
                [9, 4, 7, -3.1234, -1.5],
            ],
        };
        expect(dancerMarksLines(table)).toEqual([
            'Dancer marks: placed kicks 4, phase onsets 7, scene built at -3.12 s, model parsed at -1.5 s.',
        ]);
    });

    it('says a mark never happened when it is NaN', () => {
        const table: TelemetryTable = {
            columns: ['x.placedKicks', 'x.sceneBuiltAt', 'x.modelParsedAt'],
            rows: [[1, 2, NaN]],
        };
        expect(dancerMarksLines(table)).toEqual([
            'Dancer marks: placed kicks 1, scene built at 2 s, model parsed at never.',
        ]);
    });

    it('tolerates a CSV without the columns, or without rows', () => {
        expect(dancerMarksLines({ columns: ['t', 'dancing-character.bpm'], rows: [[0, 120]] })).toEqual([]);
        expect(dancerMarksLines({ columns: ['t', 'dancing-character.placedKicks'], rows: [] })).toEqual([]);
        expect(dancerMarksLines({ columns: ['t', 'dancing-character.placedKicks'], rows: [[0, 2]] })).toEqual([
            'Dancer marks: placed kicks 2.',
        ]);
    });
});
