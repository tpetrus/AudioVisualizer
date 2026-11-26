import { describe, expect, it } from 'vitest';
import { bassInkSceneConfig } from '../bass-ink/bassInkSceneConfig';
import { sprayAlpha, sprayFragmentShader, sprayOffset, sprayVertexShader } from './sprayShaders';

const config = bassInkSceneConfig.spray;

describe('sprayOffset', () => {
    it('is 0 at and before birth', () => {
        expect(sprayOffset(0)).toBe(0);
        expect(sprayOffset(-1)).toBe(0);
    });

    it('grows with age but never passes speed * dragSeconds', () => {
        const bound = config.speed * config.dragSeconds;
        let previous = 0;
        for (const age of [0.01, 0.1, 0.3, 0.9, 5, 1000]) {
            const offset = sprayOffset(age);
            expect(offset).toBeGreaterThan(previous);
            expect(offset).toBeLessThanOrEqual(bound);
            previous = offset;
        }
    });

    it('starts at the full speed', () => {
        expect(sprayOffset(1e-4) / 1e-4).toBeCloseTo(config.speed, 1);
    });
});

describe('sprayAlpha', () => {
    it('is 0 before birth and from lifeSeconds on', () => {
        expect(sprayAlpha(-0.01)).toBe(0);
        expect(sprayAlpha(0)).toBe(0);
        expect(sprayAlpha(config.lifeSeconds)).toBe(0);
        expect(sprayAlpha(config.lifeSeconds + 1)).toBe(0);
    });

    it('rises linearly to 1 over attackSeconds, then falls to 0', () => {
        expect(sprayAlpha(config.attackSeconds / 2)).toBeCloseTo(0.5, 6);
        expect(sprayAlpha(config.attackSeconds)).toBeCloseTo(1, 6);
        const mid = (config.attackSeconds + config.lifeSeconds) / 2;
        expect(sprayAlpha(mid)).toBeCloseTo(0.5, 6);
        expect(sprayAlpha(config.lifeSeconds - 1e-4)).toBeLessThan(0.01);
    });
});

describe('spray shader strings', () => {
    it('declare the attributes and uniforms the pool feeds', () => {
        for (const name of ['aDir', 'aBirth', 'aStrength', 'uTime', 'uPointScale']) {
            expect(sprayVertexShader).toContain(name);
        }
        for (const name of ['uColor', 'uAlphaScale']) {
            expect(sprayFragmentShader).toContain(name);
        }
    });
});
