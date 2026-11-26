// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const probeCapability = vi.fn();
vi.mock('./capability', async (importOriginal) => ({
    ...(await importOriginal<typeof import('./capability')>()),
    probeCapability: () => probeCapability() as unknown,
}));

// The cache is module state, so every spec loads a fresh copy of the hook.
async function loadHook() {
    vi.resetModules();
    return (await import('./useCapabilityHint')).useCapabilityHint;
}

beforeEach(() => {
    probeCapability.mockReset();
});

describe('useCapabilityHint', () => {
    it('is false until the probe resolves, then true for a capable device', async () => {
        let resolve: (probe: unknown) => void = () => {};
        probeCapability.mockReturnValue(new Promise((done) => (resolve = done)));
        const useCapabilityHint = await loadHook();
        const { result } = renderHook(() => useCapabilityHint(true));
        expect(result.current).toBe(false);

        await act(async () => resolve({ webgl2: true, maxTextureSize: 16384 }));
        expect(result.current).toBe(true);
    });

    it.each([
        ['a weak device', { webgl2: true, maxTextureSize: 4096 }],
        ['a failed probe', undefined],
    ])('stays false for %s', async (_name, probe) => {
        probeCapability.mockResolvedValue(probe);
        const useCapabilityHint = await loadHook();
        const { result } = renderHook(() => useCapabilityHint(true));
        await act(async () => {});
        expect(result.current).toBe(false);
    });

    it('probes once per page visit however many components ask', async () => {
        probeCapability.mockResolvedValue({ webgl2: true, maxTextureSize: 16384 });
        const useCapabilityHint = await loadHook();
        const first = renderHook(() => useCapabilityHint(true));
        const second = renderHook(() => useCapabilityHint(true));
        await act(async () => {});

        expect(probeCapability).toHaveBeenCalledTimes(1);
        expect(first.result.current).toBe(true);
        expect(second.result.current).toBe(true);
    });

    it('takes no probe while disabled, and has no export for resetting the cache', async () => {
        probeCapability.mockResolvedValue({ webgl2: true, maxTextureSize: 16384 });
        vi.resetModules();
        const module = await import('./useCapabilityHint');
        const { result, rerender } = renderHook(({ enabled }) => module.useCapabilityHint(enabled), {
            initialProps: { enabled: false },
        });
        await act(async () => {});
        expect(probeCapability).not.toHaveBeenCalled();
        expect(result.current).toBe(false);
        expect(Object.keys(module)).not.toContain('resetCapabilityHintForTests');

        rerender({ enabled: true });
        await act(async () => {});
        expect(probeCapability).toHaveBeenCalledTimes(1);
        expect(result.current).toBe(true);
    });

    it('ignores a result that arrives after unmount', async () => {
        let resolve: (probe: unknown) => void = () => {};
        probeCapability.mockReturnValue(new Promise((done) => (resolve = done)));
        const useCapabilityHint = await loadHook();
        const { unmount } = renderHook(() => useCapabilityHint(true));
        unmount();

        await act(async () => resolve({ webgl2: true, maxTextureSize: 16384 }));
    });
});
