import { describe, expect, it } from 'vitest';
import { alignmentReportLines, detectedFromTelemetry } from './alignmentReport';

const COLUMNS = ['t', 'p.bpm', 'p.beatPhase'];

// 120 bpm: a beat every 0.5 s, sampled at 10 ms.
function table() {
    const rows: number[][] = [];
    for (let i = 0; i <= 1000; i++) {
        const t = i / 100;
        rows.push([t, 120, ((t * 120) / 60) % 1]);
    }
    return { columns: COLUMNS, rows };
}

const SIDECAR = JSON.stringify({
    track: 't.wav',
    tempo: 120,
    beats: Array.from({ length: 19 }, (_, i) => 0.5 * (i + 1)),
    source: 'synthetic',
    tapOffsetMs: 0,
});

describe('detectedFromTelemetry', () => {
    it('finds the beats at the phase wraps and the tempo series', () => {
        const found = detectedFromTelemetry(table());
        if ('unavailable' in found) throw new Error('expected figures');
        expect(found.beats.length).toBeGreaterThan(15);
        expect(found.beats[1] - found.beats[0]).toBeCloseTo(0.5, 1);
        expect(found.tempo[0]).toEqual({ time: 0, bpm: 120 });
    });

    it('reports why figures are missing', () => {
        expect(detectedFromTelemetry({ columns: ['t', 'x'], rows: [] })).toEqual({
            unavailable: 'the recording has no "<probe>.bpm" column',
        });
        expect(detectedFromTelemetry({ columns: ['p.bpm'], rows: [] })).toEqual({
            unavailable: 'the recording has no "t" column',
        });
        expect(detectedFromTelemetry({ columns: ['t', 'p.bpm'], rows: [] })).toEqual({
            unavailable: 'the recording has no "<probe>.beatPhase" column',
        });
    });

    it('ignores gaps in the phase and a missing tempo', () => {
        const found = detectedFromTelemetry({
            columns: COLUMNS,
            rows: [
                [0, 120, NaN],
                [0.1, NaN, 0.9],
                [0.2, 0, 0.1],
            ],
        });
        expect('beats' in found && found.beats).toEqual([]);
        expect('tempo' in found && found.tempo[1].bpm).toBe(0);
    });
});

describe('alignmentReportLines', () => {
    it('prints the report with the figures a recording cannot give marked not available', () => {
        const text = alignmentReportLines(table(), SIDECAR).join('\n');
        expect(text).toContain('tempo ratio 1.000');
        expect(text).toContain('beat error median');
        expect(text).toContain('onsets: not available');
    });

    it('says why when the sidecar or the columns are unusable', () => {
        expect(alignmentReportLines(table(), '{').join('\n')).toContain('cannot use track.beats.json');
        expect(alignmentReportLines({ columns: ['t'], rows: [] }, SIDECAR)[0]).toContain('not available');
    });
});
