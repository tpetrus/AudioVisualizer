import { describe, expect, it } from 'vitest';
import { MANIFESTS } from './manifests';
import { applyTuning, parseTuning } from './tuning';

const ids = MANIFESTS.map((m) => m.id);

describe('parseTuning', () => {
    it('accepts known dances and groups', () => {
        const tuning = parseTuning(
            '{"lambada":{"groundLock":{"tolerance":0.01},"amplitude":[{"group":"arms","scale":0.7}]}}',
            ids,
        );
        expect(tuning.lambada.amplitude).toHaveLength(1);
    });
    it('rejects an unknown dance, an unknown group, a bad scale and a non-object', () => {
        expect(() => parseTuning('{"waltz":{}}', ids)).toThrow('unknown dance');
        expect(() => parseTuning('{"twist":{"amplitude":[{"group":"tail","scale":1}]}}', ids)).toThrow('unknown group');
        expect(() => parseTuning('{"twist":{"amplitude":[{"group":"arms","scale":0}]}}', ids)).toThrow('above 0');
        expect(() => parseTuning('[]', ids)).toThrow('not an object');
    });
});

describe('applyTuning', () => {
    const lambada = MANIFESTS.find((m) => m.id === 'lambada')!;
    it('leaves a dance without tuning alone', () => {
        expect(applyTuning(lambada, {})).toBe(lambada);
    });
    it('adds amplitude groups after the recipe and replaces the ground lock', () => {
        const tuned = applyTuning(lambada, {
            lambada: { groundLock: { tolerance: 0.02 }, amplitude: [{ group: 'legs', scale: 0.9, restBlend: 0.1 }] },
        });
        expect(tuned.groundLock).toEqual({ tolerance: 0.02 });
        expect(tuned.amplitude).toHaveLength(lambada.amplitude.length + 1);
        expect(tuned.amplitude.at(-1)).toMatchObject({ scale: 0.9, restBlend: 0.1 });
        expect(tuned.amplitude.at(-1)?.bones).toContain('footL');
    });
    it('replaces the mirrored arm elbow cap only where the recipe mirrors', () => {
        const salsa = MANIFESTS.find((m) => m.id === 'salsa')!;
        expect(applyTuning(salsa, { salsa: { elbowCapMeters: 0.2 } }).mirror?.elbowCapMeters).toBe(0.2);
        expect(applyTuning(lambada, { lambada: { elbowCapMeters: 0.2 } }).mirror).toBeUndefined();
    });
    it('keeps the recipe ground lock when the tuning does not mention it', () => {
        expect(applyTuning(lambada, { lambada: {} }).groundLock).toBe(lambada.groundLock);
    });
});
