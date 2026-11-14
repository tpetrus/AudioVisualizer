import { describe, expect, it } from 'vitest';
import { alignmentLift, formatAlignmentLift, formatOnsetRates, onsetRates } from './onsetRates';

const onsets = {
    kick: [0, 1, 2, 3],
    bass: [0.02, 1.5],
    snare: [],
    highs: [0.5, 0.52, 3.9],
};

describe('onsetRates', () => {
    it('counts events per beat between the first and last beat and the beats with an onset nearby', () => {
        const rates = onsetRates([0, 1, 2, 3], onsets);
        expect(rates.perBeat).toEqual({ kick: 4 / 3, bass: 2 / 3, snare: 0, highs: 2 / 3 });
        expect(rates.coverage).toBe(1);
        expect(rates.beatCount).toBe(4);
    });

    it('does not count an onset outside the tolerance', () => {
        expect(onsetRates([0.2, 1.2], onsets).coverage).toBe(0);
    });

    it('drops the beats after the cap', () => {
        const rates = onsetRates([0, 1, 2, 3], onsets, 2);
        expect(rates.beatCount).toBe(3);
        expect(rates.perBeat.kick).toBe(3 / 2);
    });

    it('is NaN without beats', () => {
        expect(onsetRates([], onsets).coverage).toBeNaN();
    });

    it('formats two lines', () => {
        expect(formatOnsetRates(onsetRates([], onsets))).toEqual([
            '  onset events per beat kick 1.00, bass 0.00, snare 0.00, highs 0.00',
            '  beats with an onset within 50 ms n/a (0 beats)',
        ]);
    });
});

describe('alignmentLift', () => {
    const empty = { kick: [], bass: [], snare: [], highs: [] };
    const beats = Array.from({ length: 40 }, (_, i) => 1 + i * 0.5);
    // A small seeded generator so the random-onset spec is the same on every run.
    const seeded = (seed: number): (() => number) => {
        let state = seed;
        return () => {
            state = (state * 1664525 + 1013904223) % 4294967296;
            return state / 4294967296;
        };
    };

    it('is close to one minus chance for onsets exactly on the grid', () => {
        const result = alignmentLift(beats, { ...empty, kick: beats });
        expect(result.offsetMs).toBe(0);
        expect(result.coverage).toBe(1);
        expect(result.lift).toBeCloseTo(1 - result.chance, 10);
        expect(result.lift).toBeGreaterThan(0.7);
    });

    it('gives a lift near zero for random onsets', () => {
        const random = seeded(7);
        const dense = Array.from({ length: 400 }, () => 1 + random() * 20);
        expect(Math.abs(alignmentLift(beats, { ...empty, highs: dense }).lift)).toBeLessThan(0.1);
    });

    it('recovers a constant tap latency as the offset', () => {
        // A tap after the sound needs beat + offset to reach back, so the offset is negative; early taps give positive.
        // Every offset within 50 ms of the true latency matches equally and the tie goes to the smallest |offset|, so a
        // latency of 90 ms resolves to -40, the edge of its plateau nearest zero (a latency of 40 ms would give 0).
        const late = beats.map((time) => time + 0.09);
        expect(alignmentLift(late, { ...empty, kick: beats }).offsetMs).toBe(-40);
        const early = beats.map((time) => time - 0.09);
        expect(alignmentLift(early, { ...empty, kick: beats }).offsetMs).toBe(40);
    });

    it('breaks ties toward the smallest absolute offset', () => {
        // Onsets 40 ms late are still within 50 ms of the beat at offset 0, so the plateau resolves to 0, not -10.
        expect(alignmentLift(beats, { ...empty, kick: beats.map((time) => time + 0.04) }).offsetMs).toBe(0);
    });

    it('absorbs a single jittered tap through the smoothing', () => {
        const jittered = beats.map((time, i) => (i === 20 ? time + 0.08 : time));
        const result = alignmentLift(jittered, { ...empty, kick: beats });
        expect(result.coverage).toBe(1);
        expect(result.offsetMs).toBe(0);
    });

    it('drops beats after the cap and is NaN with fewer than two beats', () => {
        expect(alignmentLift(beats, { ...empty, kick: beats }, { maxSeconds: 10 }).coverage).toBe(1);
        expect(alignmentLift([1], empty).lift).toBeNaN();
    });

    it('handles fewer beats than the smoothing window', () => {
        expect(alignmentLift([1, 1.5, 2], { ...empty, kick: [1, 1.5, 2] }).coverage).toBe(1);
    });
});

describe('formatAlignmentLift', () => {
    it('prints the lift with a signed offset, and n/a without beats', () => {
        expect(formatAlignmentLift({ offsetMs: 15, coverage: 0.8, chance: 0.4, lift: 0.4 })).toBe(
            '  onset lift 0.40 at offset +15 ms (coverage 0.80, chance 0.40)',
        );
        expect(formatAlignmentLift({ offsetMs: -30, coverage: 0.8, chance: 0.4, lift: 0.4 })).toContain(
            'offset -30 ms',
        );
        expect(formatAlignmentLift(alignmentLift([], { kick: [], bass: [], snare: [], highs: [] }))).toBe(
            '  onset lift n/a (fewer than two tapped beats)',
        );
    });
});
