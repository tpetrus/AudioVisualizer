import { describe, expect, it, vi } from 'vitest';
import { GATE_BASS_CUTOFF_HZ, GATE_BASS_WINDOW, GateBassTap } from './gateBassTap';

type Fields = Record<string, unknown>;

function makeTap(window: number[] = [0, 0]) {
    const calls: string[] = [];
    const names = new Map<unknown, string>();
    const node = (name: string, fields: Fields) => {
        const built: Fields = {
            ...fields,
            connect: vi.fn((target: unknown) => calls.push(`${name}->${names.get(target)}`)),
            disconnect: vi.fn((target?: unknown) => calls.push(`${name} x ${target ? names.get(target) : 'all'}`)),
        };
        names.set(built, name);
        return built;
    };
    let filterCount = 0;
    const context = {
        createBiquadFilter: () =>
            node(`filter${filterCount++}`, { type: 'allpass', frequency: { value: 350 }, Q: { value: 1 } }),
        createAnalyser: () =>
            node('analyser', {
                fftSize: 2048,
                getFloatTimeDomainData: (target: Float32Array) => {
                    for (let i = 0; i < target.length; i++) {
                        target[i] = window[i % window.length];
                    }
                },
            }),
    };
    const source = node('source', { context });
    const tap = new GateBassTap(source as unknown as AnalyserNode);
    return { tap, source, calls };
}

describe('GateBassTap', () => {
    it('connects source, lowpass, lowpass, analyser in that order', () => {
        const { calls } = makeTap();
        expect(calls).toEqual(['source->filter0', 'filter0->filter1', 'filter1->analyser']);
    });

    it('builds two lowpass filters at the cutoff with Q 1/sqrt(2) and an analyser of the window size', () => {
        const { source } = makeTap();
        const filter0 = (source.connect as ReturnType<typeof vi.fn>).mock.calls[0][0] as Fields;
        const filter1 = (filter0.connect as ReturnType<typeof vi.fn>).mock.calls[0][0] as Fields;
        const analyser = (filter1.connect as ReturnType<typeof vi.fn>).mock.calls[0][0] as Fields;
        for (const filter of [filter0, filter1]) {
            expect(filter.type).toBe('lowpass');
            expect(filter.frequency).toEqual({ value: GATE_BASS_CUTOFF_HZ });
            expect(filter.Q).toEqual({ value: Math.SQRT1_2 });
        }
        expect(analyser.fftSize).toBe(GATE_BASS_WINDOW);
    });

    it('reads the root mean square of the analyser window', () => {
        const { tap } = makeTap([0.5, -0.5, 1, 0]);
        expect(tap.level()).toBeCloseTo(Math.sqrt((0.25 + 0.25 + 1 + 0) / 4), 6);
    });

    it('disconnects the source from the first filter, both filters and the analyser on dispose', () => {
        const { tap, calls } = makeTap();
        calls.length = 0;
        tap.dispose();
        expect(calls).toEqual(['source x filter0', 'filter0 x all', 'filter1 x all', 'analyser x all']);
    });

    it('does not throw when the source disconnect throws', () => {
        const { tap, source, calls } = makeTap();
        (source.disconnect as ReturnType<typeof vi.fn>).mockImplementation(() => {
            throw new Error('closed');
        });
        calls.length = 0;
        expect(() => tap.dispose()).not.toThrow();
        expect(calls).toEqual(['filter0 x all', 'filter1 x all', 'analyser x all']);
    });
});
