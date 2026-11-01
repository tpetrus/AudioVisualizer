import { beforeEach, describe, expect, it } from 'vitest';
import { asWebAudio, FakeAnalyserNode, FakeAudioContext, type FakeBiquadFilterNode } from '~/test/fakeWebAudio';
import { DancingCharacterBassPulse } from './dancingCharacterBassPulse';

interface Harness {
    source: FakeAnalyserNode;
    filters: FakeBiquadFilterNode[];
    // The analyser the pulse created for itself (the context's second analyser; the first is the source).
    bassAnalyser: FakeAnalyserNode;
    pulse: DancingCharacterBassPulse;
}

function createHarness(): Harness {
    const context = new FakeAudioContext();
    const source = context.createAnalyser();
    const pulse = new DancingCharacterBassPulse(asWebAudio<AnalyserNode>(source));
    return { source, filters: context.createdFilters, bassAnalyser: context.createdAnalysers[1], pulse };
}

// Constant-amplitude samples have an RMS equal to the amplitude, so a number is enough to set the bass energy.
function run(harness: Harness, amplitude: number, frames: number): number {
    harness.bassAnalyser.setFloatTimeDomainData(amplitude);
    let result = 0;
    for (let i = 0; i < frames; i++) {
        result = harness.pulse.update();
    }
    return result;
}

describe('DancingCharacterBassPulse', () => {
    let harness: Harness;

    beforeEach(() => {
        harness = createHarness();
    });

    it('taps the source through two cascaded 120 Hz low-pass filters into its own analyser', () => {
        const [first, second] = harness.filters;
        expect(harness.filters).toHaveLength(2);
        for (const filter of harness.filters) {
            expect(filter.type).toBe('lowpass');
            expect(filter.frequency.value).toBe(120);
            expect(filter.Q.value).toBeCloseTo(Math.SQRT1_2, 10);
        }
        expect(harness.source.connect).toHaveBeenCalledWith(first);
        expect(first.connect).toHaveBeenCalledWith(second);
        expect(second.connect).toHaveBeenCalledWith(harness.bassAnalyser);
        expect(harness.bassAnalyser.fftSize).toBe(2048);
    });

    it('stays at zero for silence', () => {
        expect(run(harness, 0, 50)).toBe(0);
    });

    it('stays at zero for a steady bass, however loud', () => {
        expect(run(harness, 0.3, 600)).toBeLessThan(0.01);
    });

    it('ignores a hit while the recent level is near-silent', () => {
        expect(run(harness, 0.004, 1)).toBe(0);
    });

    it('rises when the bass gets louder after a quiet stretch', () => {
        run(harness, 0.1, 600);
        const pulse = run(harness, 0.4, 3);
        expect(pulse).toBeGreaterThan(0.3);
        expect(pulse).toBeLessThanOrEqual(1);
    });

    it('settles back toward zero once the bass stops getting louder', () => {
        run(harness, 0.1, 600);
        const peak = run(harness, 0.5, 4);
        const settled = run(harness, 0.5, 600);
        expect(settled).toBeLessThan(peak);
        expect(settled).toBeLessThan(0.05);
    });

    it('does not react to small wobbles within 15% of the recent level', () => {
        run(harness, 0.2, 600);
        expect(run(harness, 0.22, 5)).toBeLessThan(0.02);
    });

    it('disconnects its filters and analyser on dispose', () => {
        harness.pulse.dispose();
        expect(harness.source.disconnect).toHaveBeenCalledWith(harness.filters[0]);
        harness.filters.forEach((filter) => expect(filter.disconnect).toHaveBeenCalled());
        expect(harness.bassAnalyser.disconnect).toHaveBeenCalled();
    });

    it('still cleans up its own nodes when the source was already disconnected', () => {
        harness.source.disconnect.mockImplementation(() => {
            throw new Error('context closed');
        });
        expect(() => harness.pulse.dispose()).not.toThrow();
        harness.filters.forEach((filter) => expect(filter.disconnect).toHaveBeenCalled());
        expect(harness.bassAnalyser.disconnect).toHaveBeenCalled();
    });
});
