import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildFeatureBatches, digestBatches, goldenTracks } from './__fixtures__/kickBatches';
import { BOUNDARY_HARD, BOUNDARY_NONE, BoundaryDetector } from './boundary';
import { RhythmAnalyzer } from './rhythmAnalyzer';
import { FRAME_STRIDE, KICK_QUEUE_CAPACITY } from './rhythmConfig';
import { OnsetExtractor } from './onsetExtractor';
import { TEST_SAMPLE_RATE } from './testSignals';

// Golden digests of the tracker's whole state after every frame of three recordings (see goldenTracks and
// digestBatches in __fixtures__/kickBatches.ts). They were taken at base revision 7b602b87a95c19e1c81b963d87bd53e81497ad19
// (main before the kick input existed) by running this same digest code with no kicks fed, since pushKicks did not exist
// there. Feeding the kick events must not move any of them while nothing reads the events, and a change to what the
// tracker decides must show here before it ships.
const GOLDEN: Record<string, string> = {
    'steady kick': '6a4e50cb',
    // Moved by the published phase glide (PHASE_GLIDE_MS) and its refinements (backward glide length, start at the first
    // read after a move): the digest holds the eased beatPhase and nextBeatTime. With PHASE_GLIDE_MS at 0 it is the
    // digest taken before the glide, 'fe460364' (checked again for S9).
    'no kick': 'edc86934',
    'song change': '7627ee06',
};

const FRAME_RATE = new OnsetExtractor(TEST_SAMPLE_RATE).frameRate;

describe('golden digests of the tracker state', () => {
    for (const track of goldenTracks()) {
        it(`${track.name}: identical with and without the kick events`, () => {
            const batches = buildFeatureBatches(track.pcm, TEST_SAMPLE_RATE);
            expect(digestBatches(batches, FRAME_RATE, false)).toBe(GOLDEN[track.name]);
            expect(digestBatches(batches, FRAME_RATE, true)).toBe(GOLDEN[track.name]);
        });
    }

    it('the recordings carry kick events, except the one without a kick', () => {
        const kicks = (name: string): number => {
            const track = goldenTracks().find((candidate) => candidate.name === name);
            let count = 0;
            for (const batch of buildFeatureBatches(track!.pcm, TEST_SAMPLE_RATE)) {
                for (let i = 0; i < batch.onsetCount; i++) if (batch.onsetBand[i] === 0) count++;
            }
            return count;
        };
        expect(kicks('steady kick')).toBeGreaterThan(5);
        expect(kicks('song change')).toBeGreaterThan(5);
        expect(kicks('no kick')).toBe(0);
    });
});

describe('what clears the kicks', () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    const frame = new Float32Array(FRAME_STRIDE);
    const one = (): { band: Uint8Array; time: Float64Array; strength: Float32Array } => ({
        band: new Uint8Array([0]),
        time: new Float64Array([0.5]),
        strength: new Float32Array([1]),
    });

    // An analyzer that has seen frames up to 0.1 s and holds one stored kick.
    function primed(): RhythmAnalyzer {
        const analyzer = new RhythmAnalyzer(100);
        for (let i = 0; i < 11; i++) {
            if (i === 5) {
                const kick = one();
                analyzer.pushKicks(kick.band, kick.time, kick.strength, 1);
            }
            analyzer.pushFrame(i / 100, frame, 0);
        }
        expect(analyzer.beat.storedKickCount).toBe(1);
        return analyzer;
    }

    it('keeps kicks while frames follow each other, within half a frame of jitter', () => {
        const analyzer = primed();
        analyzer.pushFrame(0.114, frame, 0);
        analyzer.pushFrame(0.12, frame, 0);
        expect(analyzer.beat.storedKickCount).toBe(1);
    });

    it('delivers the kicks only at the next frame, once', () => {
        const analyzer = new RhythmAnalyzer(100);
        const kick = one();
        analyzer.pushKicks(kick.band, kick.time, kick.strength, 1);
        expect(analyzer.beat.storedKickCount).toBe(0);
        analyzer.pushFrame(0, frame, 0);
        expect(analyzer.beat.storedKickCount).toBe(1);
        expect(analyzer.beat.storedKickTime(0)).toBe(0.5);
        analyzer.pushFrame(0.01, frame, 0);
        expect(analyzer.beat.storedKickCount).toBe(1);
    });

    it('ignores events of the other bands', () => {
        const analyzer = new RhythmAnalyzer(100);
        analyzer.pushKicks(new Uint8Array([1, 2, 3]), new Float64Array([1, 2, 3]), new Float32Array([1, 1, 1]), 3);
        analyzer.pushFrame(0, frame, 0);
        expect(analyzer.beat.storedKickCount).toBe(0);
    });

    it('hardReset clears the stored kicks and the queue', () => {
        const analyzer = primed();
        const kick = one();
        analyzer.pushKicks(kick.band, kick.time, kick.strength, 1);
        analyzer.hardReset(false);
        expect(analyzer.beat.storedKickCount).toBe(0);
        analyzer.pushFrame(0.11, frame, 0);
        // The queued event was forgotten too, so nothing arrives with the next frame.
        expect(analyzer.beat.storedKickCount).toBe(0);
    });

    it('a hard boundary clears the stored kicks', () => {
        const analyzer = primed();
        vi.spyOn(BoundaryDetector.prototype, 'push').mockReturnValueOnce(BOUNDARY_HARD);
        analyzer.pushFrame(0.11, frame, 0);
        expect(analyzer.beat.storedKickCount).toBe(0);
        expect(analyzer.state.songChangeCount).toBe(1);
    });

    it('a time-base restart clears the stored kicks but keeps the events that came with the restarted batch', () => {
        const analyzer = primed();
        // A jump in time can look like silence to the boundary detector, which is not what is checked here.
        vi.spyOn(BoundaryDetector.prototype, 'push').mockReturnValue(BOUNDARY_NONE);
        const kick = one();
        kick.time[0] = 40.5;
        analyzer.pushKicks(kick.band, kick.time, kick.strength, 1);
        analyzer.pushFrame(40, frame, 0);
        expect(analyzer.beat.storedKickCount).toBe(1);
        expect(analyzer.beat.storedKickTime(0)).toBe(40.5);
    });

    it('a restart to an earlier time clears too, and a half frame is the limit', () => {
        const analyzer = primed();
        analyzer.pushFrame(0.1 + 0.01 + 0.0049, frame, 0);
        expect(analyzer.beat.storedKickCount).toBe(1);
        analyzer.pushFrame(0.02, frame, 0);
        expect(analyzer.beat.storedKickCount).toBe(0);
    });

    it('a restart does nothing else: the tempo and beat state are as without the kicks', () => {
        const withKick = new RhythmAnalyzer(100);
        const without = new RhythmAnalyzer(100);
        const kick = one();
        for (const analyzer of [withKick, without]) {
            for (let i = 0; i < 30; i++) {
                if (analyzer === withKick && i === 10) analyzer.pushKicks(kick.band, kick.time, kick.strength, 1);
                // A jump at frame 20.
                analyzer.pushFrame(i < 20 ? i / 100 : 50 + i / 100, frame, 0);
            }
        }
        expect(withKick.beat.storedKickCount).toBe(0);
        expect(withKick.state).toEqual(without.state);
        expect(withKick.gridEpoch).toBe(without.gridEpoch);
    });

    it('the first frame of an analyzer is never a restart', () => {
        const analyzer = new RhythmAnalyzer(100);
        const kick = one();
        analyzer.pushKicks(kick.band, kick.time, kick.strength, 1);
        analyzer.pushFrame(1234, frame, 0);
        expect(analyzer.beat.storedKickCount).toBe(1);
    });

    it('counts events dropped when more arrive than the queue holds', () => {
        const analyzer = new RhythmAnalyzer(100);
        const count = 40;
        const band = new Uint8Array(count);
        const time = new Float64Array(count).map((_, i) => i);
        const strength = new Float32Array(count).fill(1);
        analyzer.pushKicks(band, time, strength, count);
        expect(analyzer.kickOverflowCount).toBe(count - KICK_QUEUE_CAPACITY);
        analyzer.pushFrame(0, frame, 0);
        expect(analyzer.beat.storedKickCount).toBe(KICK_QUEUE_CAPACITY);
        // The newest events survive, oldest first.
        expect(analyzer.beat.storedKickTime(0)).toBe(count - KICK_QUEUE_CAPACITY);
        expect(analyzer.beat.storedKickTime(KICK_QUEUE_CAPACITY - 1)).toBe(count - 1);
    });
});
