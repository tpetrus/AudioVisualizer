import { describe, expect, it } from 'vitest';
import { buildFeatureBatches } from './__fixtures__/kickBatches';
import { KickQueue, type KickSink } from './kickQueue';
import { KICK_ONSET_BAND, KICK_QUEUE_CAPACITY, BATCH_FRAMES, FEATURE_ONSET_BANDS } from './rhythmConfig';
import { renderTrack, TEST_SAMPLE_RATE } from './testSignals';

// Records what a queue hands over, in order.
function recorder(): KickSink & { events: [number, number][] } {
    const events: [number, number][] = [];
    return {
        events,
        pushKick: (time, strength) => {
            events.push([time, strength]);
        },
    };
}

describe('KickQueue', () => {
    it('delivers events oldest first with their own times, and each only once', () => {
        const queue = new KickQueue(4);
        queue.push(2, 0.5);
        queue.push(1, 0.25);
        queue.push(3, 1);
        expect(queue.size).toBe(3);

        const first = recorder();
        queue.drainTo(first);
        // Arrival order, not time order: the second event is older than the first.
        expect(first.events).toEqual([
            [2, 0.5],
            [1, 0.25],
            [3, 1],
        ]);
        expect(queue.size).toBe(0);

        const second = recorder();
        queue.drainTo(second);
        expect(second.events).toEqual([]);
    });

    it('keeps order across the end of its storage', () => {
        const queue = new KickQueue(3);
        const sink = recorder();
        for (let round = 0; round < 4; round++) {
            queue.push(round * 2, 0.5);
            queue.push(round * 2 + 1, 0.5);
            queue.drainTo(sink);
        }
        expect(sink.events.map(([time]) => time)).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
    });

    it('drops the oldest events when full and counts them', () => {
        const queue = new KickQueue(3);
        for (let i = 1; i <= 5; i++) {
            queue.push(i, i / 10);
        }
        expect(queue.size).toBe(3);
        expect(queue.overflowCount).toBe(2);
        const sink = recorder();
        queue.drainTo(sink);
        expect(sink.events.map(([time]) => time)).toEqual([3, 4, 5]);
        // The count is for the queue's whole life.
        queue.push(6, 0);
        queue.clear();
        expect(queue.overflowCount).toBe(2);
    });

    it('forgets waiting events on clear without delivering them', () => {
        const queue = new KickQueue(3);
        queue.push(1, 1);
        queue.push(2, 1);
        queue.clear();
        expect(queue.size).toBe(0);
        const sink = recorder();
        queue.drainTo(sink);
        expect(sink.events).toEqual([]);
        queue.push(9, 1);
        queue.drainTo(sink);
        expect(sink.events).toEqual([[9, 1]]);
    });

    it('allocates nothing after construction: its storage keeps its identity and size', () => {
        const queue = new KickQueue(2);
        const internals = queue as unknown as { times: Float64Array; strengths: Float32Array };
        const { times, strengths } = internals;
        const sink = recorder();
        for (let i = 0; i < 50; i++) {
            queue.push(i, 1);
            if (i % 7 === 0) queue.drainTo(sink);
            if (i % 11 === 0) queue.clear();
        }
        expect(internals.times).toBe(times);
        expect(internals.strengths).toBe(strengths);
        expect(times.length).toBe(2);
        expect(strengths.length).toBe(2);
    });

    it('holds at least one worklet batch of events of every band', () => {
        expect(KICK_QUEUE_CAPACITY).toBeGreaterThanOrEqual(BATCH_FRAMES * FEATURE_ONSET_BANDS.length);
        expect(FEATURE_ONSET_BANDS[KICK_ONSET_BAND]).toBe('kick');
    });

    it('delivers the events of lagging worklet batches once each, in arrival order', () => {
        const { pcm } = renderTrack({ seconds: 8, bpm: 120, beatsPerBar: 4, accent: 0, sampleRate: TEST_SAMPLE_RATE });
        const batches = buildFeatureBatches(pcm, TEST_SAMPLE_RATE);
        const queue = new KickQueue(KICK_QUEUE_CAPACITY);
        const sink = recorder();
        const sent: [number, number][] = [];
        let older = 0;
        for (const batch of batches) {
            for (let i = 0; i < batch.onsetCount; i++) {
                if (batch.onsetBand[i] !== KICK_ONSET_BAND) continue;
                queue.push(batch.onsetTime[i], batch.onsetStrength[i]);
                sent.push([batch.onsetTime[i], batch.onsetStrength[i]]);
                // The worklet decides an onset late, so its time is often before the batch's first frame.
                if (batch.onsetTime[i] < batch.time0) older++;
            }
            // The analyzer empties the queue at the batch's first frame.
            queue.drainTo(sink);
        }
        expect(sent.length).toBeGreaterThan(5);
        expect(older).toBeGreaterThan(0);
        expect(sink.events).toEqual(sent);
        expect(queue.overflowCount).toBe(0);
    });
});
