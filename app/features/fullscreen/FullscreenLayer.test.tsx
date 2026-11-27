// @vitest-environment jsdom
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FullscreenLayer } from './FullscreenLayer';
import { FULLSCREEN_STRINGS } from './strings';
import type { FullscreenHint } from './types';

// jsdom may not provide PointerEvent, so build it from a MouseEvent and add the pointerId.
function pointer(target: Element, type: 'pointerdown' | 'pointerup', x: number, y: number, pointerId = 1) {
    const event = new MouseEvent(type, { bubbles: true, clientX: x, clientY: y });
    Object.defineProperty(event, 'pointerId', { value: pointerId });
    act(() => {
        target.dispatchEvent(event);
    });
}

function tap(target: Element, { dx = 0, ms = 50, id = 1 } = {}) {
    pointer(target, 'pointerdown', 100, 100, id);
    act(() => {
        vi.advanceTimersByTime(ms);
    });
    pointer(target, 'pointerup', 100 + dx, 100, id);
}

interface Props {
    active: boolean;
    hint: FullscreenHint;
}

function setup(props: Props) {
    const onExit = vi.fn();
    const ui = (p: Props) => (
        <div data-testid="wrapper">
            <div data-testid="canvas" />
            <FullscreenLayer active={p.active} hint={p.hint} onExit={onExit} />
        </div>
    );
    const view = render(ui(props));
    return {
        onExit,
        canvas: screen.getByTestId('canvas'),
        rerender: (p: Props) => view.rerender(ui(p)),
        unmount: view.unmount,
    };
}

const exitButton = () => screen.queryByRole('button', { name: FULLSCREEN_STRINGS.exitButton });

describe('FullscreenLayer toast', () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    it('shows the keyboard hint on activation and hides it after 3000 ms', () => {
        setup({ active: true, hint: 'keyboard' });
        expect(screen.getByRole('status').textContent).toBe(FULLSCREEN_STRINGS.keyboardHint);
        act(() => {
            vi.advanceTimersByTime(2999);
        });
        expect(screen.getByRole('status').textContent).toBe(FULLSCREEN_STRINGS.keyboardHint);
        act(() => {
            vi.advanceTimersByTime(1);
        });
        expect(screen.getByRole('status').textContent).toBe('');
    });

    it('shows the touch hint for hint touch', () => {
        setup({ active: true, hint: 'touch' });
        expect(screen.getByRole('status').textContent).toBe(FULLSCREEN_STRINGS.touchHint);
    });

    it('keeps an empty live region when mounted inactive', () => {
        setup({ active: false, hint: 'keyboard' });
        const status = screen.getByRole('status');
        expect(status.textContent).toBe('');
        expect(status.getAttribute('aria-live')).toBe('polite');
        expect(status.classList.contains('hidden')).toBe(false);
        expect(status.className).not.toContain('bg-surface-0');
    });

    it('gives the toast a box only while it is shown, and never hides the region', () => {
        setup({ active: true, hint: 'keyboard' });
        const status = screen.getByRole('status');
        expect(status.className).toContain('bg-surface-0/80');
        act(() => {
            vi.advanceTimersByTime(3000);
        });
        expect(status.classList.contains('hidden')).toBe(false);
        expect(status.className).not.toContain('bg-surface-0');
    });

    it('hides at once when going inactive and shows again on re-entry', () => {
        const { rerender } = setup({ active: true, hint: 'keyboard' });
        act(() => {
            vi.advanceTimersByTime(2000);
        });
        rerender({ active: false, hint: 'keyboard' });
        expect(screen.getByRole('status').textContent).toBe('');
        expect(vi.getTimerCount()).toBe(0);
        rerender({ active: true, hint: 'keyboard' });
        expect(screen.getByRole('status').textContent).toBe(FULLSCREEN_STRINGS.keyboardHint);
        act(() => {
            vi.advanceTimersByTime(2999);
        });
        expect(screen.getByRole('status').textContent).toBe(FULLSCREEN_STRINGS.keyboardHint);
    });
});

describe('FullscreenLayer touch exit button', () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    it('is revealed by a tap, hides after 3000 ms and a second tap restarts the timer', () => {
        const { canvas } = setup({ active: true, hint: 'touch' });
        expect(exitButton()).toBeNull();
        tap(canvas);
        const button = exitButton();
        expect(button).not.toBeNull();
        expect(button?.getAttribute('title')).toBe(FULLSCREEN_STRINGS.exitButton);
        act(() => {
            vi.advanceTimersByTime(2000);
        });
        tap(canvas);
        act(() => {
            vi.advanceTimersByTime(2900);
        });
        expect(exitButton()).not.toBeNull();
        act(() => {
            vi.advanceTimersByTime(100);
        });
        expect(exitButton()).toBeNull();
    });

    it('ignores drags, long presses, a mismatched pointer and an up without a down', () => {
        const { canvas } = setup({ active: true, hint: 'touch' });
        tap(canvas, { dx: 10 });
        tap(canvas, { ms: 300 });
        pointer(canvas, 'pointerdown', 100, 100, 1);
        pointer(canvas, 'pointerup', 100, 100, 2);
        pointer(canvas, 'pointerup', 100, 100, 1);
        expect(exitButton()).toBeNull();
    });

    it('calls onExit when clicked', () => {
        const { canvas, onExit } = setup({ active: true, hint: 'touch' });
        tap(canvas);
        fireEvent.click(exitButton() as HTMLElement);
        expect(onExit).toHaveBeenCalledTimes(1);
    });

    it('never shows a button for the keyboard hint', () => {
        const { canvas } = setup({ active: true, hint: 'keyboard' });
        tap(canvas);
        expect(exitButton()).toBeNull();
    });

    it('does not cancel the pointer events', () => {
        const { canvas } = setup({ active: true, hint: 'touch' });
        const event = new MouseEvent('pointerdown', { bubbles: true, cancelable: true });
        Object.defineProperty(event, 'pointerId', { value: 1 });
        act(() => {
            canvas.dispatchEvent(event);
        });
        expect(event.defaultPrevented).toBe(false);
    });

    it('hides the button and ignores taps once inactive, with no timers left', () => {
        const { canvas, rerender } = setup({ active: true, hint: 'touch' });
        tap(canvas);
        rerender({ active: false, hint: 'touch' });
        expect(exitButton()).toBeNull();
        expect(vi.getTimerCount()).toBe(0);
        tap(canvas);
        expect(exitButton()).toBeNull();
        expect(vi.getTimerCount()).toBe(0);
    });

    it('clears everything on unmount', () => {
        const { canvas, unmount } = setup({ active: true, hint: 'touch' });
        tap(canvas);
        unmount();
        expect(vi.getTimerCount()).toBe(0);
    });
});
