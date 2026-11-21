import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import { createFullscreenController } from '~/features/fullscreen/fullscreenController';
import { isEscapeKey, shouldToggleOnKey } from '~/features/fullscreen/fullscreenKeys';
import {
    FULLSCREEN_IDLE_CURSOR_CLASSES,
    FULLSCREEN_IDLE_CURSOR_MS,
    FULLSCREEN_TOGGLE_ATTRIBUTE,
    type FullscreenHint,
    type FullscreenMode,
    type UseFullscreenResult,
} from '~/features/fullscreen/types';
import { useLatestRef } from './useLatestRef';

// Fullscreen for the element `targetRef` points at: the browser's fullscreen where it works, otherwise a "pseudo" mode
// where only the app's GUI hides. The hook owns the F and Escape keys, the idle cursor and the focus return.
export function useFullscreen(targetRef: RefObject<HTMLElement | null>): UseFullscreenResult {
    // One controller per mount; created in render rather than at module scope because it needs `document`.
    const [controller] = useState(() => createFullscreenController(document));
    const [mode, setMode] = useState<FullscreenMode>('off');
    const [hint, setHint] = useState<FullscreenHint>('keyboard');
    const active = mode !== 'off';

    const modeRef = useLatestRef(mode);
    const mountedRef = useRef(false);
    // The element fullscreen was last requested for. The unmount cleanup runs after React detaches `targetRef`, so it
    // cannot read the target from there.
    const lastTargetRef = useRef<HTMLElement | null>(null);

    // True while the browser already shows the target fullscreen. The browser sets its fullscreen element before the
    // change event arrives (a frame later, longer under a heavy scene), so a second F press in that gap must count as
    // leaving, not as a second request.
    const browserFullscreen = useCallback(() => {
        const target = lastTargetRef.current;
        return target !== null && controller.isActive(target);
    }, [controller]);

    // True from the request until its answer. A second toggle in that gap would race the first request.
    const pendingRef = useRef(false);
    // Set when the user asked to leave while a request was pending, so a late refusal does not pull in pseudo mode.
    const leaveRequestedRef = useRef(false);

    const exit = useCallback(() => {
        if (pendingRef.current) leaveRequestedRef.current = true;
        if (modeRef.current === 'native' || browserFullscreen()) void controller.exit();
        else if (modeRef.current === 'pseudo') setMode('off');
    }, [browserFullscreen, controller, modeRef]);

    const toggle = useCallback(() => {
        const target = targetRef.current;
        if (!target) return;
        // Checked before the pending guard: the browser can already show fullscreen while its request is unanswered.
        if (modeRef.current !== 'off' || browserFullscreen()) {
            exit();
            return;
        }
        if (pendingRef.current) return;
        lastTargetRef.current = target;
        const coarse = typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches;
        setHint(coarse ? 'touch' : 'keyboard');
        // No await before this call: the Fullscreen API only accepts a request made inside the user's gesture.
        // Native state is set by the change event below, never here.
        pendingRef.current = true;
        leaveRequestedRef.current = false;
        void controller.enter(target).then((accepted) => {
            pendingRef.current = false;
            if (!accepted && mountedRef.current && !leaveRequestedRef.current) setMode('pseudo');
        });
    }, [browserFullscreen, controller, exit, modeRef, targetRef]);

    const toggleRef = useLatestRef(toggle);
    const exitRef = useLatestRef(exit);

    // Follows the browser: its Escape and exit UI end native fullscreen without going through this hook.
    useEffect(() => {
        mountedRef.current = true;
        const unsubscribe = controller.subscribe(() => {
            const target = lastTargetRef.current;
            if (!target || !mountedRef.current) return;
            if (controller.isActive(target)) setMode('native');
            else setMode((current) => (current === 'native' ? 'off' : current));
        });
        return () => {
            mountedRef.current = false;
            unsubscribe();
            // Leave only a fullscreen this hook started; StrictMode's throwaway mount finds nothing active.
            const target = lastTargetRef.current;
            if (target && controller.isActive(target)) void controller.exit();
        };
    }, [controller]);

    useEffect(() => {
        const onKeyDown = (event: KeyboardEvent) => {
            if (shouldToggleOnKey(event)) {
                event.preventDefault();
                toggleRef.current();
            } else if (modeRef.current === 'pseudo' && isEscapeKey(event)) {
                exitRef.current();
            }
        };
        document.addEventListener('keydown', onKeyDown);
        return () => document.removeEventListener('keydown', onKeyDown);
    }, [exitRef, modeRef, toggleRef]);

    // Hides the cursor after it rests for a while, and shows it again on the next movement.
    useEffect(() => {
        const target = lastTargetRef.current;
        if (!active || !target) return;
        let timer: ReturnType<typeof setTimeout> | undefined;
        const hide = () => target.classList.add(...FULLSCREEN_IDLE_CURSOR_CLASSES);
        const restart = () => {
            clearTimeout(timer);
            target.classList.remove(...FULLSCREEN_IDLE_CURSOR_CLASSES);
            timer = setTimeout(hide, FULLSCREEN_IDLE_CURSOR_MS);
        };
        restart();
        document.addEventListener('pointermove', restart);
        return () => {
            clearTimeout(timer);
            document.removeEventListener('pointermove', restart);
            target.classList.remove(...FULLSCREEN_IDLE_CURSOR_CLASSES);
        };
    }, [active]);

    // The toggle button is hidden while fullscreen, so focus can return only after the commit that shows it again.
    const wasActiveRef = useRef(false);
    useEffect(() => {
        if (wasActiveRef.current && !active) {
            const button = document.querySelector(`[${FULLSCREEN_TOGGLE_ATTRIBUTE}]`);
            if (button instanceof HTMLElement) button.focus();
        }
        wasActiveRef.current = active;
    }, [active]);

    return { active, mode, hint, toggle, exit };
}
