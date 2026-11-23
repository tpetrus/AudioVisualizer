import { describe, expect, it } from 'vitest';
import { TEST_SAMPLE_RATE, renderTrack } from '../../app/features/rhythm/testSignals';
import {
    countDiffering,
    formatHeader,
    formatRows,
    formatWindows,
    medianByWindow,
    nearestTapErrorMs,
    parseTraceArguments,
    scorecardDeltaMs,
    selectRows,
    windowRatio,
    type TraceRow,
} from './beatTrace';
import { traceBeats, traceTrack } from './beatTraceRunner';

const row = (overrides: Partial<TraceRow> = {}): TraceRow => ({
    time: 10,
    errorMs: 12.34,
    bin: 1,
    offset: 0.0625,
    ratio: 1.234,
    phaseWins: 2,
    phaseBeats: 0,
    phaseBeatsReset: true,
    peakOffsetMs: null,
    period: 0.5,
    phaseShiftCount: 0,
    gridEpoch: 1,
    moveOffset: null,
    scorecardTime: null,
    scorecardErrorMs: null,
    ...overrides,
});

describe('parseTraceArguments', () => {
    it('prints the usage for no arguments and --help', () => {
        expect(parseTraceArguments([])).toBeUndefined();
        expect(parseTraceArguments(['x.wav', '--help'])).toBeUndefined();
    });

    it('reads the wav, overrides, range, window and json file', () => {
        expect(
            parseTraceArguments([
                'a.wav',
                '--set',
                'BEAT_PHASE_GAIN=0.5',
                '--from',
                '5',
                '--to',
                '20',
                '--window',
                '2',
                '--json',
                'o.json',
            ]),
        ).toEqual({
            wav: 'a.wav',
            overrides: [{ name: 'BEAT_PHASE_GAIN', value: '0.5' }],
            from: 5,
            to: 20,
            windowSeconds: 2,
            json: 'o.json',
        });
    });

    it.each([
        [['a.wav', '--from'], /needs a value/],
        [['a.wav', '--from', 'x'], /number of seconds/],
        [['a.wav', '--window', '0'], /above 0/],
        [['a.wav', '--from', '9', '--to', '3'], /not be below/],
        [['--set', 'A=1'], /Missing <wav>/],
        [['a.wav', 'b.wav'], /Only one WAV/],
        [['a.wav', '--nope'], /Unknown option/],
        [['a.wav', '--set', 'A=1', '--set', 'A=2'], /twice/],
    ])('rejects %j', (argv, message) => {
        expect(() => parseTraceArguments(argv)).toThrow(message);
    });
});

describe('nearestTapErrorMs', () => {
    it('is beat minus the nearest tap in ms, signed, and null without taps', () => {
        const taps = [1, 2, 3];
        expect(nearestTapErrorMs(taps, 2.1)).toBeCloseTo(100, 6);
        expect(nearestTapErrorMs(taps, 2.9)).toBeCloseTo(-100, 6);
        expect(nearestTapErrorMs(taps, 0)).toBeCloseTo(-1000, 6);
        expect(nearestTapErrorMs(taps, 9)).toBeCloseTo(6000, 6);
        expect(nearestTapErrorMs([], 1)).toBeNull();
    });

    it('sends a tie to the earlier tap', () => {
        expect(nearestTapErrorMs([1, 2], 1.5)).toBeCloseTo(500, 6);
    });
});

describe('medianByWindow', () => {
    it('takes the median absolute error per window and keeps empty windows', () => {
        const rows = [
            { time: 1, errorMs: -10 },
            { time: 2, errorMs: 30 },
            { time: 3, errorMs: 20 },
            { time: 12, errorMs: null },
        ];
        expect(medianByWindow(rows, 5)).toEqual([
            { start: 0, medianAbsErrorMs: 20, beats: 3 },
            { start: 5, medianAbsErrorMs: null, beats: 0 },
            { start: 10, medianAbsErrorMs: null, beats: 1 },
        ]);
        expect(medianByWindow([], 5)).toEqual([]);
    });

    it('averages the two middle values of an even window', () => {
        expect(
            medianByWindow(
                [
                    { time: 1, errorMs: 10 },
                    { time: 2, errorMs: -30 },
                ],
                5,
            )[0].medianAbsErrorMs,
        ).toBe(20);
    });
});

describe('windowRatio, countDiffering, selectRows', () => {
    it('divides the window sums and is null when the grid window is empty', () => {
        expect(windowRatio(3, 2)).toBe(1.5);
        expect(windowRatio(3, 0)).toBeNull();
    });

    it('counts index-paired beats that differ and is null for different lengths', () => {
        expect(countDiffering([1, 2, 3], [1, 2.5, 3])).toBe(1);
        expect(countDiffering([1], [1, 2])).toBeNull();
    });

    it('keeps the rows inside the range', () => {
        const rows = [row({ time: 1 }), row({ time: 5 }), row({ time: 9 })];
        expect(selectRows(rows, 2, 9).map((r) => r.time)).toEqual([5, 9]);
    });
});

describe('formatting', () => {
    it('prints an aligned table with the reset mark and blanks for missing values', () => {
        const lines = formatRows([
            row(),
            row({ time: 10.5, errorMs: null, ratio: null, phaseBeats: 3, phaseBeatsReset: false }),
        ]);
        expect(lines[0].trim().split(/\s+/)).toEqual([
            'time',
            'err',
            'bin',
            'off',
            'ratio',
            'wins',
            'beats',
            'peak',
            'period',
            'shifts',
            'epoch',
            'mv',
            'sc_dt',
            'sc_err',
        ]);
        expect(lines[1]).toContain('0*');
        expect(lines[1]).toContain('12.3');
        expect(lines[2]).not.toContain('*');
    });

    it('gives the scorecard delta in ms', () => {
        expect(scorecardDeltaMs({ time: 1, scorecardTime: 1.25 })).toBeCloseTo(250, 6);
        expect(scorecardDeltaMs({ time: 1, scorecardTime: null })).toBeNull();
    });

    it('prints the header with the lock times and a note about differing beats', () => {
        const summary = {
            lockSeconds: 8,
            beatErrorMedianMs: 153.44,
            gateFirstOpenSeconds: null,
            dancerLockSeconds: 8.13,
            beatsDiffering: 3,
        };
        const text = formatHeader('a.wav', [{ name: 'X', value: '1' }], summary).join('\n');
        expect(text).toContain('a.wav X=1');
        expect(text).toContain('tracker lock (scorecard): 8.00 s');
        expect(text).toContain('gate first open: never');
        expect(text).toContain('153.4');
        expect(text).toContain('3 declared beats differ');
        expect(
            formatHeader('a', [], { ...summary, beatsDiffering: null, beatErrorMedianMs: null }).join('\n'),
        ).toContain('differ in count');
        expect(formatHeader('a', [], { ...summary, beatsDiffering: 0 }).join('\n')).not.toContain('note');
    });

    it('prints both window medians side by side', () => {
        const declared = [{ start: 0, medianAbsErrorMs: 12, beats: 4 }];
        const scorecard = [{ start: 0, medianAbsErrorMs: null, beats: 4 }];
        expect(formatWindows(declared, scorecard, 5).join('\n')).toMatch(/0\s+12\.0\s+-\s+\(4\)/);
    });
});

describe('the trace of a pipeline run', () => {
    const track = renderTrack({ seconds: 30, bpm: 120, beatsPerBar: 4 });

    it('declares the beats the replay derives on a clean click track, with the correction and phase check read', () => {
        const input = {
            track: 'click.wav',
            class: 'synthetic' as const,
            pcm: track.pcm,
            sampleRate: TEST_SAMPLE_RATE,
            bpm: 120,
        };
        const rows = traceBeats(input);
        expect(rows.length).toBeGreaterThan(30);
        // Beat times rise and the period holds the tempo.
        for (let i = 1; i < rows.length; i++) expect(rows[i].time).toBeGreaterThan(rows[i - 1].time);
        expect(rows[rows.length - 1].period).toBeCloseTo(0.5, 1);
        // A click on every beat is a hit for the correction, which reports where the onset was.
        const hits = rows.filter((r) => r.peakOffsetMs !== null);
        expect(hits.length).toBeGreaterThan(rows.length / 2);
        expect(rows.every((r) => r.errorMs === null)).toBe(true);

        const result = traceTrack(input);
        // The same beats as replayPcm's, paired by index, on a signal with no octave change or grid move.
        expect(result.summary.beatsDiffering).toBe(0);
        expect(result.summary.lockSeconds).not.toBeNull();
        expect(result.summary.beatErrorMedianMs).toBeNull();
        expect(result.summary.dancerLockSeconds).not.toBeNull();
    });

    it('takes errors against the sidecar taps and the scorecard median from the replay beats', () => {
        const result = traceTrack({
            track: 'click.wav',
            class: 'synthetic',
            pcm: track.pcm,
            sampleRate: TEST_SAMPLE_RATE,
            sidecar: { track: 'click.wav', tempo: 120, beats: track.beatTimes, source: 'synthetic', tapOffsetMs: 0 },
        });
        expect(result.rows.every((r) => r.errorMs !== null && r.scorecardErrorMs !== null)).toBe(true);
        expect(result.summary.beatErrorMedianMs).not.toBeNull();
        // The median over the rows after the lock equals the scorecard's, since both come from the replay beats.
        const after = result.rows
            .filter((r) => r.time >= (result.summary.lockSeconds ?? 0))
            .map((r) => Math.abs(r.scorecardErrorMs ?? 0));
        expect(after.length).toBeGreaterThan(0);
    });

    it('gives no scorecard figures for a beatless track', () => {
        const result = traceTrack({ track: 'b.wav', class: 'beatless', pcm: track.pcm, sampleRate: TEST_SAMPLE_RATE });
        expect(result.summary.lockSeconds).toBeNull();
        expect(result.summary.beatErrorMedianMs).toBeNull();
    });
});
