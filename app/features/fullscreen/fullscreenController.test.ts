import { describe, expect, it, vi } from 'vitest';
import { createFullscreenController } from './fullscreenController';

// A plain object is enough for the controller: it only reads a few members and adds listeners.
function fakeDoc(members: Record<string, unknown>) {
    const listeners = new Map<string, Set<() => void>>();
    const doc = {
        documentElement: {},
        addEventListener: vi.fn((type: string, listener: () => void) => {
            if (!listeners.has(type)) listeners.set(type, new Set());
            listeners.get(type)!.add(listener);
        }),
        removeEventListener: vi.fn((type: string, listener: () => void) => listeners.get(type)?.delete(listener)),
        ...members,
    };
    const fire = (type: string) => listeners.get(type)?.forEach((listener) => listener());
    return { doc: doc as unknown as Document, fire, listeners };
}

const element = (members: Record<string, unknown> = {}) => members as unknown as HTMLElement;

describe('createFullscreenController', () => {
    describe('support', () => {
        it('is native when enabled and elements can request fullscreen', () => {
            const { doc } = fakeDoc({ fullscreenEnabled: true, documentElement: { requestFullscreen: vi.fn() } });
            expect(createFullscreenController(doc).support).toBe('native');
        });

        it('is webkit when only the prefixed API exists', () => {
            const { doc } = fakeDoc({
                webkitFullscreenEnabled: true,
                documentElement: { webkitRequestFullscreen: vi.fn() },
            });
            expect(createFullscreenController(doc).support).toBe('webkit');
        });

        it('is none when fullscreen is disabled, even if the method exists', () => {
            const { doc } = fakeDoc({ fullscreenEnabled: false, documentElement: { requestFullscreen: vi.fn() } });
            expect(createFullscreenController(doc).support).toBe('none');
        });

        it('is none when the flag is set but the element method is missing', () => {
            const { doc } = fakeDoc({ fullscreenEnabled: true, webkitFullscreenEnabled: true });
            expect(createFullscreenController(doc).support).toBe('none');
        });
    });

    describe('native', () => {
        const setup = (members: Record<string, unknown> = {}) =>
            fakeDoc({ fullscreenEnabled: true, documentElement: { requestFullscreen: vi.fn() }, ...members });

        it('requests fullscreen with the navigation UI hidden and resolves true', async () => {
            const { doc } = setup();
            const request = vi.fn().mockResolvedValue(undefined);
            await expect(createFullscreenController(doc).enter(element({ requestFullscreen: request }))).resolves.toBe(
                true,
            );
            expect(request).toHaveBeenCalledWith({ navigationUI: 'hide' });
        });

        it('resolves false when the request is rejected', async () => {
            const { doc } = setup();
            const request = vi.fn().mockRejectedValue(new TypeError('blocked'));
            await expect(createFullscreenController(doc).enter(element({ requestFullscreen: request }))).resolves.toBe(
                false,
            );
        });

        it('resolves false when the request throws', async () => {
            const { doc } = setup();
            const request = vi.fn(() => {
                throw new Error('boom');
            });
            await expect(createFullscreenController(doc).enter(element({ requestFullscreen: request }))).resolves.toBe(
                false,
            );
        });

        it('exits only while the document has a fullscreen element', async () => {
            const exitFullscreen = vi.fn().mockResolvedValue(undefined);
            const controller = createFullscreenController(setup({ fullscreenElement: null, exitFullscreen }).doc);
            await controller.exit();
            expect(exitFullscreen).not.toHaveBeenCalled();

            const active = createFullscreenController(setup({ fullscreenElement: {}, exitFullscreen }).doc);
            await active.exit();
            expect(exitFullscreen).toHaveBeenCalledOnce();
        });

        it('swallows a rejected exit', async () => {
            const exitFullscreen = vi.fn().mockRejectedValue(new Error('no'));
            const controller = createFullscreenController(setup({ fullscreenElement: {}, exitFullscreen }).doc);
            await expect(controller.exit()).resolves.toBeUndefined();
        });

        it('reports whether an element is the fullscreen element', () => {
            const target = element();
            const { doc } = setup({ fullscreenElement: target });
            const controller = createFullscreenController(doc);
            expect(controller.isActive(target)).toBe(true);
            expect(controller.isActive(element())).toBe(false);
        });

        it('subscribes to fullscreenchange and unsubscribes', () => {
            const { doc, fire, listeners } = setup();
            const listener = vi.fn();
            const unsubscribe = createFullscreenController(doc).subscribe(listener);
            fire('fullscreenchange');
            expect(listener).toHaveBeenCalledOnce();
            unsubscribe();
            fire('fullscreenchange');
            expect(listener).toHaveBeenCalledOnce();
            expect(listeners.get('fullscreenchange')?.size).toBe(0);
        });
    });

    describe('webkit', () => {
        const setup = (members: Record<string, unknown> = {}) =>
            fakeDoc({
                webkitFullscreenEnabled: true,
                documentElement: { webkitRequestFullscreen: vi.fn() },
                ...members,
            });

        it('enters with the prefixed call, which may return nothing', async () => {
            const request = vi.fn();
            await expect(
                createFullscreenController(setup().doc).enter(element({ webkitRequestFullscreen: request })),
            ).resolves.toBe(true);
            expect(request).toHaveBeenCalledOnce();
        });

        it('resolves false when the prefixed call throws or rejects', async () => {
            const controller = createFullscreenController(setup().doc);
            const throws = vi.fn(() => {
                throw new Error('boom');
            });
            await expect(controller.enter(element({ webkitRequestFullscreen: throws }))).resolves.toBe(false);
            const rejects = vi.fn().mockRejectedValue(new Error('no'));
            await expect(controller.enter(element({ webkitRequestFullscreen: rejects }))).resolves.toBe(false);
        });

        it('exits with the prefixed call only while in fullscreen, and swallows a throw', async () => {
            const webkitExitFullscreen = vi.fn();
            await createFullscreenController(setup({ webkitFullscreenElement: null, webkitExitFullscreen }).doc).exit();
            expect(webkitExitFullscreen).not.toHaveBeenCalled();

            const active = createFullscreenController(setup({ webkitFullscreenElement: {}, webkitExitFullscreen }).doc);
            await active.exit();
            expect(webkitExitFullscreen).toHaveBeenCalledOnce();

            const throwing = vi.fn(() => {
                throw new Error('boom');
            });
            const bad = createFullscreenController(
                setup({ webkitFullscreenElement: {}, webkitExitFullscreen: throwing }).doc,
            );
            await expect(bad.exit()).resolves.toBeUndefined();
        });

        it('reads the prefixed fullscreen element', () => {
            const target = element();
            const controller = createFullscreenController(setup({ webkitFullscreenElement: target }).doc);
            expect(controller.isActive(target)).toBe(true);
            expect(controller.isActive(element())).toBe(false);
        });

        it('subscribes to webkitfullscreenchange', () => {
            const { doc, fire } = setup();
            const listener = vi.fn();
            const unsubscribe = createFullscreenController(doc).subscribe(listener);
            fire('fullscreenchange');
            expect(listener).not.toHaveBeenCalled();
            fire('webkitfullscreenchange');
            expect(listener).toHaveBeenCalledOnce();
            unsubscribe();
            fire('webkitfullscreenchange');
            expect(listener).toHaveBeenCalledOnce();
        });
    });

    describe('none', () => {
        it('refuses to enter, never exits, is never active and ignores subscriptions', async () => {
            const { doc } = fakeDoc({ fullscreenEnabled: false });
            const controller = createFullscreenController(doc);
            const request = vi.fn();
            await expect(controller.enter(element({ requestFullscreen: request }))).resolves.toBe(false);
            expect(request).not.toHaveBeenCalled();
            await expect(controller.exit()).resolves.toBeUndefined();
            expect(controller.isActive(element())).toBe(false);
            const unsubscribe = controller.subscribe(vi.fn());
            expect(doc.addEventListener).not.toHaveBeenCalled();
            expect(() => unsubscribe()).not.toThrow();
        });
    });
});
