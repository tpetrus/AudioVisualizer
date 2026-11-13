import { describe, expect, it } from 'vitest';
import { alignmentReportLines, detectedFromTelemetry, onsetsFromTelemetry } from './alignmentReport';

const NEWLINE = String.fromCharCode(10);
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
        expect(text).toContain('reaction offset: not measured');
    });

    it('says why when the sidecar or the columns are unusable', () => {
        expect(alignmentReportLines(table(), '{').join('\n')).toContain('cannot use track.beats.json');
        expect(alignmentReportLines({ columns: ['t'], rows: [] }, SIDECAR)[0]).toContain('not available');
    });
});

// 60 Hz rows; a kick onset strength spikes at each time in `kicks` and decays over three frames.
function onsetTable(kicks: number[]) {
    const rows: number[][] = [];
    for (let i = 0; i < 300; i++) {
        const t = i / 60;
        let kick = 0;
        for (const k of kicks) {
            const frames = i - Math.round(k * 60);
            if (frames >= 0 && frames < 3) kick = Math.max(kick, 1 - frames / 3);
        }
        rows.push([t, 120, (t * 2) % 1, kick, 0, 0]);
    }
    return { columns: ['t', 'p.bpm', 'p.beatPhase', 'onsetKick', 'onsetMid', 'onsetHigh'], rows };
}

describe('live onsets and the reaction offset', () => {
    it('picks onsets from the recorded columns and leaves out a band that never fires', () => {
        const found = onsetsFromTelemetry(onsetTable([0.5, 1, 1.5]));
        expect(found?.kick?.map((time) => Math.round(time * 10) / 10)).toEqual([0.5, 1, 1.5]);
        expect(found?.snare).toEqual([]);
        expect(onsetsFromTelemetry({ columns: ['t', 'x'], rows: [] })).toBeUndefined();
        expect(onsetsFromTelemetry({ columns: ['onsetKick'], rows: [] })).toBeUndefined();
    });

    it('scores them against a sidecar with onsets and states the frame allowance', () => {
        const sidecar = JSON.stringify({
            track: 't.wav',
            tempo: 120,
            beats: [0.5, 1, 1.5],
            onsets: { kick: [0.5, 1, 1.5], bass: [], snare: [], highs: [] },
            source: 'synthetic',
            tapOffsetMs: 0,
        });
        const text = alignmentReportLines(onsetTable([0.5, 1, 1.5]), sidecar, { reactionColumn: 'onsetKick' }).join(
            NEWLINE,
        );
        expect(text).toContain('onsets at 50 ms');
        expect(text).toContain('frame allowance +/-16.7 ms');
        expect(text).toContain('reactionOffsetMs (onsetKick)');
        expect(alignmentReportLines(onsetTable([0.5]), SIDECAR).join(NEWLINE)).toContain('onsets: not scored');
    });

    it('still measures the reaction offset when the recording has no tempo columns', () => {
        const rows = onsetTable([0.5, 1, 1.5]).rows.map((row) => [row[0], row[3]]);
        const table = { columns: ['t', 'onsetKick'], rows };
        const lines = alignmentReportLines(table, SIDECAR, { reactionColumn: 'onsetKick' });
        expect(lines[0]).toContain('not available');
        expect(lines[1]).toContain('reactionOffsetMs (onsetKick)');
        expect(alignmentReportLines(table, SIDECAR)).toHaveLength(1);
    });

    it('says why a reaction column cannot be used', () => {
        const text = alignmentReportLines(onsetTable([0.5]), SIDECAR, { reactionColumn: 'nope' }).join(NEWLINE);
        expect(text).toContain('reaction offset: not available, the recording has no "nope" column');
    });
});
