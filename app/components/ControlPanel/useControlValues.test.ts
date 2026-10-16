// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { ControlDefinition } from './controls';
import { useControlValues } from './useControlValues';

const definitions = [
    { section: 'A', key: 'gain', label: 'Gain', type: 'range', min: 0, max: 10, step: 1, default: 5 },
    { section: 'A', key: 'on', label: 'On', type: 'checkbox', default: true },
    { section: 'B', key: 'tint', label: 'Tint', type: 'color', default: '#ff0000' },
] as const satisfies readonly ControlDefinition[];

describe('useControlValues', () => {
    it('starts at the definitions defaults', () => {
        const { result } = renderHook(() => useControlValues(definitions));

        expect(result.current.values).toEqual({ gain: 5, on: true, tint: '#ff0000' });
        expect(result.current.valuesRef.current).toBe(result.current.values);
    });

    it('setValue changes one key and leaves the rest', () => {
        const { result } = renderHook(() => useControlValues(definitions));

        act(() => result.current.setValue('gain', 8));
        act(() => result.current.setValue('on', false));

        expect(result.current.values).toEqual({ gain: 8, on: false, tint: '#ff0000' });
    });

    it('keeps valuesRef pointing at the newest values for the render loop', () => {
        const { result } = renderHook(() => useControlValues(definitions));
        const ref = result.current.valuesRef;

        act(() => result.current.setValue('tint', '#00ff00'));

        expect(result.current.valuesRef).toBe(ref);
        expect(ref.current.tint).toBe('#00ff00');
    });

    it('resetAll restores every default', () => {
        const { result } = renderHook(() => useControlValues(definitions));
        act(() => {
            result.current.setValue('gain', 1);
            result.current.setValue('on', false);
            result.current.setValue('tint', '#123456');
        });

        act(() => result.current.resetAll());

        expect(result.current.values).toEqual({ gain: 5, on: true, tint: '#ff0000' });
    });

    it('returns stable callbacks across renders', () => {
        const { result, rerender } = renderHook(() => useControlValues(definitions));
        const { setValue, resetAll } = result.current;

        act(() => result.current.setValue('gain', 2));
        rerender();

        expect(result.current.setValue).toBe(setValue);
        expect(result.current.resetAll).toBe(resetAll);
    });
});
