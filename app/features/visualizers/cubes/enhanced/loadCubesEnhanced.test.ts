import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadCubesEnhanced, type CubesEnhancedModule } from './loadCubesEnhanced';

const fakeModule = { CubesEnhancedLook: class {} } as unknown as CubesEnhancedModule;

afterEach(() => vi.restoreAllMocks());

describe('loadCubesEnhanced', () => {
    it('resolves the look class when the import succeeds', async () => {
        const result = await loadCubesEnhanced(new AbortController().signal, () => Promise.resolve(fakeModule));

        expect(result).toEqual({ ok: true, Look: fakeModule.CubesEnhancedLook });
    });

    it('resolves ok: false without importing when the signal is already aborted', async () => {
        const importer = vi.fn(() => Promise.resolve(fakeModule));
        const controller = new AbortController();
        controller.abort();

        expect(await loadCubesEnhanced(controller.signal, importer)).toEqual({ ok: false });
        expect(importer).not.toHaveBeenCalled();
    });

    it('resolves ok: false as soon as it is aborted, even if the import later succeeds, and stays quiet', async () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        let finish!: (module: CubesEnhancedModule) => void;
        const controller = new AbortController();
        const pending = loadCubesEnhanced(controller.signal, () => new Promise((resolve) => (finish = resolve)));

        controller.abort();
        expect(await pending).toEqual({ ok: false });
        finish(fakeModule);
        await Promise.resolve();
        expect(warn).not.toHaveBeenCalled();
    });

    it('resolves ok: false when the signal aborts in the same turn the import settles', async () => {
        const controller = new AbortController();
        const result = loadCubesEnhanced(controller.signal, async () => {
            controller.abort();
            return fakeModule;
        });

        expect(await result).toEqual({ ok: false });
    });

    it('never rejects: an import failure is ok: false with one warning', async () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

        const result = await loadCubesEnhanced(new AbortController().signal, () => Promise.reject(new Error('chunk')));

        expect(result).toEqual({ ok: false });
        expect(warn).toHaveBeenCalledTimes(1);
    });

    it('does not warn about an import failure that arrives after an abort', async () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const controller = new AbortController();
        const result = loadCubesEnhanced(controller.signal, async () => {
            controller.abort();
            throw new Error('chunk');
        });

        expect(await result).toEqual({ ok: false });
        expect(warn).not.toHaveBeenCalled();
    });
});
