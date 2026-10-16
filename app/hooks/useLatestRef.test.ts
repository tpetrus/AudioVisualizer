// @vitest-environment jsdom
import { renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useLatestRef } from './useLatestRef';

describe('useLatestRef', () => {
    it('holds the initial value', () => {
        const { result } = renderHook(() => useLatestRef('first'));

        expect(result.current.current).toBe('first');
    });

    it('returns the same ref object on every render, updated to the newest value', () => {
        const { result, rerender } = renderHook(({ value }) => useLatestRef(value), { initialProps: { value: 1 } });
        const ref = result.current;

        rerender({ value: 2 });
        rerender({ value: 3 });

        // A render loop created once holds this object, so it must stay the same while its content changes.
        expect(result.current).toBe(ref);
        expect(ref.current).toBe(3);
    });

    it('keeps the latest value readable by a callback captured on the first render', () => {
        const { result, rerender } = renderHook(({ value }) => useLatestRef(value), { initialProps: { value: 'a' } });
        const read = () => result.current.current;

        rerender({ value: 'b' });

        expect(read()).toBe('b');
    });
});
