// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { renderToString } from 'react-dom/server';
import { afterEach, describe, expect, it } from 'vitest';
import { setEnhancedGraphics } from './enhancedGraphicsStore';
import { useEnhancedGraphics } from './useEnhancedGraphics';

afterEach(() => localStorage.clear());

function Probe() {
    return <span>{String(useEnhancedGraphics())}</span>;
}

describe('useEnhancedGraphics', () => {
    it('follows the store', () => {
        const { result } = renderHook(() => useEnhancedGraphics());
        expect(result.current).toBe(false);

        act(() => setEnhancedGraphics(true));
        expect(result.current).toBe(true);
    });

    it('renders off on the server even when the stored preference is on', () => {
        localStorage.setItem('audioVisualizer.enhancedGraphics', 'true');
        expect(renderToString(<Probe />)).toContain('false');
    });
});
