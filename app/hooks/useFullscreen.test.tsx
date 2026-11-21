// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { StrictMode, type ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FULLSCREEN_IDLE_CURSOR_CLASSES, FULLSCREEN_IDLE_CURSOR_MS } from '~/features/fullscreen/types';
import { installFakeFullscreen, type FakeFullscreen } from '~/test/fakeFullscreen';
import { useFullscreen } from './useFullscreen';

let fullscreen: FakeFullscreen;
let target: HTMLDivElement;

function mount(wrapper?: ({ children }: { children: ReactNode }) => ReactNode) {
    const targetRef = { current: target };
    return renderHook(() => useFullscreen(targetRef), { wrapper });
}

function key(init: KeyboardEventInit, on: Element | Document = document) {
    act(() => {
        on.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init }));
    });
}

// Lets the controller's promise settle and the change event land.
const settle = () => act(async () => {});

function setup(support: 'native' | 'webkit' | 'none', reject = false) {
    fullscreen = installFakeFullscreen({ support, reject });
}

beforeEach(() => {
    target = document.createElement('div');
    document.body.append(target);
});

afterEach(() => {
    fullscreen?.restore();
    document.body.replaceChildren();
    vi.useRealTimers();
    vi.unstubAllGlobals();
});

describe('useFullscreen', () => {
    it('starts off with the keyboard hint', () => {
        setup('native');
        const { result } = mount();
        expect(result.current).toMatchObject({ active: false, mode: 'off', hint: 'keyboard' });
    });

    it('enters native fullscreen from the change event, not from the request', async () => {
        setup('native');
        const { result } = mount();
        act(() => result.current.toggle());
        expect(fullscreen.requestCalls).toHaveBeenCalledTimes(1);
        expect(result.current.mode).toBe('off');
        await settle();
        expect(fullscreen.element).toBe(target);
        expect(result.current).toMatchObject({ active: true, mode: 'native' });
    });

    it('does nothing without a target', () => {
        setup('native');
        const { result } = renderHook(() => useFullscreen({ current: null }));
        act(() => result.current.toggle());
        expect(fullscreen.requestCalls).not.toHaveBeenCalled();
    });

    it('works with the webkit API', async () => {
        setup('webkit');
        const { result } = mount();
        act(() => result.current.toggle());
        await settle();
        expect(result.current.mode).toBe('native');
        act(() => result.current.exit());
        await settle();
        expect(result.current.mode).toBe('off');
    });

    it('exits native fullscreen through the controller and follows the change event', async () => {
        setup('native');
        const { result } = mount();
        act(() => result.current.toggle());
        await settle();
        act(() => result.current.toggle());
        await settle();
        expect(fullscreen.exitCalls).toHaveBeenCalledTimes(1);
        expect(result.current.mode).toBe('off');
    });

    it('follows an exit by the browser and returns focus to the toggle button', async () => {
        setup('native');
        const button = document.createElement('button');
        button.setAttribute('data-fullscreen-toggle', '');
        document.body.append(button);
        const { result } = mount();
        expect(document.activeElement).not.toBe(button);
        act(() => result.current.toggle());
        await settle();
        act(() => fullscreen.exitExternally());
        expect(result.current.mode).toBe('off');
        expect(document.activeElement).toBe(button);
    });

    it('leaves focus alone when no toggle button exists', async () => {
        setup('native');
        const { result } = mount();
        act(() => result.current.toggle());
        await settle();
        act(() => fullscreen.exitExternally());
        expect(result.current.mode).toBe('off');
    });

    it('ignores change events for fullscreen it did not start', () => {
        setup('native');
        const { result } = mount();
        act(() => fullscreen.exitExternally());
        expect(result.current.mode).toBe('off');
    });

    it('falls back to pseudo mode when fullscreen is not supported', async () => {
        setup('none');
        const { result } = mount();
        act(() => result.current.toggle());
        await settle();
        expect(result.current).toMatchObject({ active: true, mode: 'pseudo' });
        act(() => result.current.exit());
        expect(result.current.mode).toBe('off');
    });

    it('falls back to pseudo mode when the request is rejected', async () => {
        setup('native', true);
        const { result } = mount();
        act(() => result.current.toggle());
        await settle();
        expect(result.current.mode).toBe('pseudo');
    });

    it('does not set state after unmount when a request is rejected late', async () => {
        setup('native', true);
        const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
        const { result, unmount } = mount();
        act(() => result.current.toggle());
        unmount();
        await settle();
        expect(errors).not.toHaveBeenCalled();
        errors.mockRestore();
    });

    it('exit does nothing when off', () => {
        setup('native');
        const { result } = mount();
        act(() => result.current.exit());
        expect(fullscreen.exitCalls).not.toHaveBeenCalled();
        expect(result.current.mode).toBe('off');
    });

    it('reads a coarse pointer as the touch hint, and its absence as keyboard', async () => {
        setup('none');
        vi.stubGlobal(
            'matchMedia',
            vi.fn((query: string) => ({ matches: query === '(pointer: coarse)' })),
        );
        const { result } = mount();
        act(() => result.current.toggle());
        await settle();
        expect(result.current.hint).toBe('touch');
        act(() => result.current.exit());
        vi.stubGlobal('matchMedia', undefined);
        act(() => result.current.toggle());
        await settle();
        expect(result.current.hint).toBe('keyboard');
    });

    describe('keyboard', () => {
        it('toggles on and off with F and prevents the default', async () => {
            setup('native');
            const { result } = mount();
            key({ key: 'f' });
            await settle();
            expect(result.current.mode).toBe('native');
            key({ key: 'F' });
            await settle();
            expect(result.current.mode).toBe('off');
        });

        it('ignores F while a text input has focus but not a range input', async () => {
            setup('none');
            const { result } = mount();
            const text = document.createElement('input');
            const range = document.createElement('input');
            range.type = 'range';
            document.body.append(text, range);
            key({ key: 'f' }, text);
            await settle();
            expect(result.current.mode).toBe('off');
            key({ key: 'f' }, range);
            await settle();
            expect(result.current.mode).toBe('pseudo');
        });

        it('leaves pseudo mode with Escape', async () => {
            setup('none');
            const { result } = mount();
            key({ key: 'f' });
            await settle();
            key({ key: 'Escape' });
            expect(result.current.mode).toBe('off');
        });

        it('ignores Escape when off and in native mode', async () => {
            setup('native');
            const { result } = mount();
            key({ key: 'Escape' });
            expect(result.current.mode).toBe('off');
            key({ key: 'f' });
            await settle();
            key({ key: 'Escape' });
            await settle();
            expect(fullscreen.exitCalls).not.toHaveBeenCalled();
            expect(result.current.mode).toBe('native');
        });
    });

    describe('idle cursor', () => {
        const hidden = () => FULLSCREEN_IDLE_CURSOR_CLASSES.every((name) => target.classList.contains(name));
        const visible = () => FULLSCREEN_IDLE_CURSOR_CLASSES.every((name) => !target.classList.contains(name));

        it('hides the cursor after it rests, shows it on movement and on exit', async () => {
            vi.useFakeTimers();
            setup('none');
            const { result } = mount();
            act(() => result.current.toggle());
            await act(async () => {});
            expect(visible()).toBe(true);
            act(() => void vi.advanceTimersByTime(FULLSCREEN_IDLE_CURSOR_MS - 1));
            expect(visible()).toBe(true);
            act(() => void vi.advanceTimersByTime(1));
            expect(hidden()).toBe(true);

            act(() => void document.dispatchEvent(new MouseEvent('mousemove')));
            expect(visible()).toBe(true);
            act(() => void vi.advanceTimersByTime(FULLSCREEN_IDLE_CURSOR_MS));
            expect(hidden()).toBe(true);

            act(() => result.current.exit());
            expect(visible()).toBe(true);
            act(() => void vi.advanceTimersByTime(FULLSCREEN_IDLE_CURSOR_MS * 2));
            expect(visible()).toBe(true);
        });

        it('clears the timer on unmount', async () => {
            vi.useFakeTimers();
            setup('none');
            const { result, unmount } = mount();
            act(() => result.current.toggle());
            await act(async () => {});
            unmount();
            act(() => void vi.advanceTimersByTime(FULLSCREEN_IDLE_CURSOR_MS * 2));
            expect(visible()).toBe(true);
        });
    });

    describe('unmount', () => {
        it('exits native fullscreen and removes every listener', async () => {
            setup('native');
            const { result, unmount } = mount();
            act(() => result.current.toggle());
            await settle();
            unmount();
            expect(fullscreen.exitCalls).toHaveBeenCalledTimes(1);
            expect(fullscreen.element).toBeNull();

            key({ key: 'f' });
            await settle();
            expect(fullscreen.requestCalls).toHaveBeenCalledTimes(1);
        });

        it('does not exit when it is not fullscreen', () => {
            setup('native');
            const { unmount } = mount();
            unmount();
            expect(fullscreen.exitCalls).not.toHaveBeenCalled();
        });

        it('does not exit a fullscreen that belongs to something else', async () => {
            setup('native');
            const { result, unmount } = mount();
            act(() => result.current.toggle());
            await settle();
            const other = document.createElement('div');
            document.body.append(other);
            await act(async () => other.requestFullscreen());
            unmount();
            expect(fullscreen.exitCalls).not.toHaveBeenCalled();
        });

        it('survives StrictMode without exiting or logging errors', async () => {
            setup('native');
            const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
            const { result, unmount } = mount(({ children }) => <StrictMode>{children}</StrictMode>);
            expect(fullscreen.exitCalls).not.toHaveBeenCalled();
            act(() => result.current.toggle());
            await settle();
            expect(result.current.mode).toBe('native');
            unmount();
            expect(errors).not.toHaveBeenCalled();
            errors.mockRestore();
        });
    });
});
