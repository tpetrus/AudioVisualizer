import { describe, expect, it } from 'vitest';
import { METER_MIN_BEATS } from './rhythmConfig';
import { MeterEstimator } from './meter';
import { createRandom } from './testSignals';
import type { BeatsPerBar } from './types';

const PERIOD = 0.5;

interface Feeder {
    meter: MeterEstimator;
    // Index of the next beat to add.
    next: number;
    random: () => number;
}

function createFeeder(meter = new MeterEstimator(), firstIndex = 1, seed = 5): Feeder {
    return { meter, next: firstIndex, random: createRandom(seed) };
}

// Adds `count` beats whose accent falls on indices where (index - downbeatIndex) % beatsPerBar === 0, with ~5% noise.
// `strength` 0 makes every beat equal (no accent at all).
function feed(feeder: Feeder, count: number, beatsPerBar: number, downbeatIndex: number, strength = 1): void {
    for (let i = 0; i < count; i++) {
        const index = feeder.next++;
        const onDownbeat = (((index - downbeatIndex) % beatsPerBar) + beatsPerBar) % beatsPerBar === 0;
        const accent = onDownbeat ? strength : 0;
        const noise = () => 1 + (feeder.random() * 2 - 1) * 0.05;
        const kick = (0.3 + 0.7 * accent) * noise();
        const total = (0.4 + 0.6 * accent) * noise();
        const chroma = (0.1 + 0.7 * accent) * noise();
        feeder.meter.addBeat(index, kick, total, chroma, PERIOD);
    }
}

describe('MeterEstimator', () => {
    it('reports nothing before it has enough beats', () => {
        const feeder = createFeeder();
        feed(feeder, METER_MIN_BEATS - 1, 4, 1);
        expect(feeder.meter.beatsPerBar).toBeUndefined();
        expect(feeder.meter.barPosition(1)).toBe(-1);
    });

    it.each<[BeatsPerBar, number]>([
        [4, 1],
        [4, 2],
        [4, 4],
        [3, 1],
        [3, 2],
        [3, 3],
    ])('settles on %i beats per bar when the accent falls on beat index %i of the counter', (beatsPerBar, downbeatIndex) => {
        const feeder = createFeeder();
        feed(feeder, 60, beatsPerBar, downbeatIndex);
        expect(feeder.meter.beatsPerBar).toBe(beatsPerBar);
        expect(feeder.meter.confidence).toBeGreaterThan(0.5);
    });

    it('gives bar position 0 on the accented beat and counts on from it', () => {
        for (const beatsPerBar of [3, 4] as const) {
            const feeder = createFeeder(new MeterEstimator(), 1);
            const downbeatIndex = 6;
            feed(feeder, 60, beatsPerBar, downbeatIndex);
            const meter = feeder.meter;
            expect(meter.beatsPerBar).toBe(beatsPerBar);
            for (let k = 0; k < 3 * beatsPerBar; k++) {
                expect(meter.barPosition(downbeatIndex + k)).toBe(k % beatsPerBar);
                // Negative offsets wrap into the bar rather than going negative.
                expect(meter.barPosition(downbeatIndex - k)).toBe((beatsPerBar - (k % beatsPerBar)) % beatsPerBar);
            }
        }
    });

    it('stays unsure when every beat has the same accent', () => {
        const feeder = createFeeder();
        feed(feeder, 120, 4, 1, 0);
        expect(feeder.meter.beatsPerBar).toBeUndefined();
        expect(feeder.meter.confidence).toBeLessThan(0.3);
    });

    it('stays unsure for identical beats with no noise at all', () => {
        const meter = new MeterEstimator();
        for (let i = 1; i <= 100; i++) {
            meter.addBeat(i, 1, 1, 0.5, PERIOD);
        }
        expect(meter.beatsPerBar).toBeUndefined();
        expect(meter.barPosition(10)).toBe(-1);
    });

    it('does not switch meter because of one stray bar (hysteresis)', () => {
        const feeder = createFeeder();
        feed(feeder, 60, 4, 1);
        expect(feeder.meter.beatsPerBar).toBe(4);
        // One bar of triple accents is not enough evidence to change a meter that has been solid for 15 bars.
        feed(feeder, 3, 3, feeder.next);
        expect(feeder.meter.beatsPerBar).toBe(4);
    });

    it('switches to the other meter after sustained contrary evidence', () => {
        const feeder = createFeeder();
        feed(feeder, 60, 4, 1);
        expect(feeder.meter.beatsPerBar).toBe(4);
        feed(feeder, 120, 3, feeder.next);
        expect(feeder.meter.beatsPerBar).toBe(3);
    });

    it('moves the downbeat when the accent moves, without changing the meter', () => {
        const feeder = createFeeder();
        feed(feeder, 60, 4, 1);
        expect(feeder.meter.barPosition(1)).toBe(0);
        // The same 4/4 pattern, but the accent is now on the beat that was position 2.
        feed(feeder, 160, 4, 3);
        expect(feeder.meter.beatsPerBar).toBe(4);
        expect(feeder.meter.barPosition(3)).toBe(0);
    });

    it('shrink(keep) with a tiny keep drops the meter and a keep of 1 retains it', () => {
        const feeder = createFeeder();
        feed(feeder, 60, 4, 1);
        feeder.meter.shrink(1);
        expect(feeder.meter.beatsPerBar).toBe(4);

        feeder.meter.shrink(0.1);
        expect(feeder.meter.beatsPerBar).toBeUndefined();
        expect(feeder.meter.confidence).toBe(0);
    });

    it('keeps a long-established meter through a soft shrink but still adopts new evidence', () => {
        const feeder = createFeeder();
        feed(feeder, 60, 4, 1);
        feeder.meter.shrink(0.2);
        // 60 beats shrunk to a fifth is still METER_MIN_BEATS, so the old meter survives until contrary evidence wins.
        expect(feeder.meter.beatsPerBar).toBe(4);
        feed(feeder, 60, 3, feeder.next);
        expect(feeder.meter.beatsPerBar).toBe(3);
    });

    it('clears everything on reset()', () => {
        const feeder = createFeeder();
        feed(feeder, 60, 3, 1);
        expect(feeder.meter.beatsPerBar).toBe(3);
        feeder.meter.reset();
        expect(feeder.meter.beatsPerBar).toBeUndefined();
        expect(feeder.meter.confidence).toBe(0);
        expect(feeder.meter.barPosition(1)).toBe(-1);

        // After a reset it must learn from scratch, including needing the minimum number of beats again.
        const fresh = createFeeder(feeder.meter, 100);
        feed(fresh, METER_MIN_BEATS - 1, 4, 100);
        expect(feeder.meter.beatsPerBar).toBeUndefined();
        feed(fresh, 50, 4, 100);
        expect(feeder.meter.beatsPerBar).toBe(4);
    });
});
