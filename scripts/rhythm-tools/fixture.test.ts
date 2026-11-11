import { describe, expect, it } from 'vitest';
import { FIXTURE_LEVELS, FIXTURE_MAX, decodeOnset, encodeFixture, parseFixture, serializeFixture } from './fixture';

describe('fixture encoding', () => {
    it('round-trips an envelope to within one quantization step and clamps out-of-range values', () => {
        const envelope = [0, 0.5, 1.2345, 3, 7, -1];

        const fixture = encodeFixture('demo', envelope, 100, 120);
        const decoded = decodeOnset(fixture);

        expect(fixture.onset).toHaveLength(envelope.length * 3);
        expect(fixture.referenceBpm).toBe(120);
        const step = FIXTURE_MAX / FIXTURE_LEVELS;
        envelope
            .slice(0, 4)
            .forEach((value, i) => expect(Math.abs(decoded[i] - value)).toBeLessThanOrEqual(step / 2 + 1e-6));
        expect(decoded[4]).toBeCloseTo(3, 6);
        expect(decoded[5]).toBe(0);
    });

    it('keeps only the first seconds and records a missing reference as null', () => {
        const fixture = encodeFixture('demo', new Float32Array(500), 100, undefined, 2);

        expect(fixture.seconds).toBe(2);
        expect(decodeOnset(fixture)).toHaveLength(200);
        expect(fixture.referenceBpm).toBeNull();
    });

    it('serializes to text that parses back to the same fixture', () => {
        const fixture = encodeFixture('demo', [0.1, 0.2, 0.3], 100, 90);

        expect(parseFixture(serializeFixture(fixture))).toEqual(fixture);
    });

    it.each([
        ['not json', '{'],
        ['a wrong version', JSON.stringify({ version: 2 })],
        ['odd hex', JSON.stringify({ ...encodeFixture('d', [1], 100, 1), onset: 'zz1' })],
        ['a ragged envelope', JSON.stringify({ ...encodeFixture('d', [1], 100, 1), onset: 'ffff' })],
    ])('rejects %s', (_label, text) => {
        expect(() => parseFixture(text)).toThrow();
    });
});
