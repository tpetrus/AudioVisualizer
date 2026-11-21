import { useEffect, useRef, useState } from 'react';
import { FULLSCREEN_STRINGS } from './strings';
import {
    FULLSCREEN_EXIT_BUTTON_MS,
    FULLSCREEN_HINT_MS,
    FULLSCREEN_TAP_MAX_MOVE_PX,
    FULLSCREEN_TAP_MAX_MS,
    type FullscreenLayerProps,
} from './types';

interface PointerStart {
    id: number;
    x: number;
    y: number;
    time: number;
}

// The overlay of the fullscreen wrapper: a hint toast on entry and, on touch devices, an exit button a tap reveals.
// It never intercepts pointer input (only the button does), so the canvas underneath can still be dragged.
export function FullscreenLayer(props: FullscreenLayerProps) {
    const { active, hint } = props;
    const rootRef = useRef<HTMLDivElement>(null);
    const [toastExpired, setToastExpired] = useState(false);
    const [buttonVisible, setButtonVisible] = useState(false);
    const touch = active && hint === 'touch';
    const toastVisible = active && !toastExpired;

    // The toast shows on each off-to-on change of `active`. The live region itself stays mounted, so screen readers
    // announce the text when it is put into it.
    useEffect(() => {
        if (!active) return;
        const timer = setTimeout(() => setToastExpired(true), FULLSCREEN_HINT_MS);
        return () => {
            clearTimeout(timer);
            setToastExpired(false);
        };
    }, [active]);

    // Taps on the wrapper (the canvas's events bubble up to it) reveal the exit button; drags that orbit the camera
    // do not. The listeners are passive and never stop or cancel the events.
    useEffect(() => {
        const wrapper = rootRef.current?.parentElement;
        if (!touch || !wrapper) return;
        let start: PointerStart | null = null;
        let timer: ReturnType<typeof setTimeout> | undefined;
        const onDown = (event: PointerEvent) => {
            start = { id: event.pointerId, x: event.clientX, y: event.clientY, time: event.timeStamp };
        };
        const onUp = (event: PointerEvent) => {
            const down = start;
            start = null;
            if (!down || down.id !== event.pointerId) return;
            const moved = Math.hypot(event.clientX - down.x, event.clientY - down.y);
            if (moved >= FULLSCREEN_TAP_MAX_MOVE_PX || event.timeStamp - down.time >= FULLSCREEN_TAP_MAX_MS) return;
            clearTimeout(timer);
            setButtonVisible(true);
            timer = setTimeout(() => setButtonVisible(false), FULLSCREEN_EXIT_BUTTON_MS);
        };
        wrapper.addEventListener('pointerdown', onDown, { passive: true });
        wrapper.addEventListener('pointerup', onUp, { passive: true });
        return () => {
            wrapper.removeEventListener('pointerdown', onDown);
            wrapper.removeEventListener('pointerup', onUp);
            clearTimeout(timer);
            setButtonVisible(false);
        };
    }, [touch]);

    return (
        <div ref={rootRef} className="pointer-events-none absolute inset-0 z-10">
            <p
                role="status"
                aria-live="polite"
                className={`pointer-events-none absolute top-4 left-1/2 -translate-x-1/2 rounded bg-black/70 px-4 py-2 text-center text-sm text-white ${toastVisible ? '' : 'hidden'}`}
            >
                {toastVisible ? FULLSCREEN_STRINGS[hint === 'touch' ? 'touchHint' : 'keyboardHint'] : ''}
            </p>
            {touch && buttonVisible && (
                <button
                    type="button"
                    aria-label={FULLSCREEN_STRINGS.exitButton}
                    title={FULLSCREEN_STRINGS.exitButton}
                    onClick={() => props.onExit()}
                    className="pointer-events-auto absolute top-4 right-4 flex h-11 w-11 items-center justify-center rounded bg-black/70 text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
                >
                    <svg
                        aria-hidden="true"
                        viewBox="0 0 24 24"
                        className="h-6 w-6"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                    >
                        <path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5" />
                    </svg>
                </button>
            )}
        </div>
    );
}
