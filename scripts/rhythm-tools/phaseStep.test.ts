import { describe, expect, it } from 'vitest';
import { excessStep, measurePhaseSteps, wrapHalf, worstOverMovedTracks, type PhaseStepResult } from './phaseStep';

describe('wrapHalf', () => {
    it('maps into [-0.5, 0.5), so +0.5 wraps to -0.5 and -0.5 stays', () => {
        expect(wrapHalf(0.5)).toBe(-0.5);
        expect(wrapHalf(-0.5)).toBe(-0.5);
        expect(wrapHalf(0.49)).toBeCloseTo(0.49, 12);
        expect(wrapHalf(-0.51)).toBeCloseTo(0.49, 12);
        expect(wrapHalf(1.25)).toBeCloseTo(0.25, 12);
        expect(wrapHalf(0)).toBe(0);
    });
});

describe('excessStep', () => {
    it('is 0 on a steady phase advancing by one render period', () => {
        const period = 0.5;
        const step = 1 / 60 / period;
        expect(excessStep(0.3 + step, 0.3, period)).toBeCloseTo(0, 12);
        // Across the wrap too.
        expect(excessStep((0.99 + step) % 1, 0.99, period)).toBeCloseTo(0, 12);
    });

    it('measures a jump beyond the steady advance', () => {
        expect(excessStep(0.4, 0.3, 0.5)).toBeCloseTo(0.1 - 1 / 60 / 0.5, 12);
    });
});

describe('worstOverMovedTracks', () => {
    it('ignores tracks without a grid move', () => {
        const track = (maxExcess: number, gridMoves: number): PhaseStepResult => ({
            maxExcess,
            atSeconds: 0,
            gridMoves,
            steps: 1,
        });
        const results = new Map([
            ['a', track(0.3, 0)],
            ['b', track(0.05, 2)],
            ['c', track(0.08, 1)],
        ]);
        expect(worstOverMovedTracks(results)).toBe(0.08);
    });
});

describe('measurePhaseSteps', () => {
    it('runs to the end of silent audio with no phase to compare', () => {
        const result = measurePhaseSteps(new Float32Array(48000), 48000);
        expect(result).toEqual({ maxExcess: 0, atSeconds: 0, gridMoves: 0, steps: 0 });
    });
});
