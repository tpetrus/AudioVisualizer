// The contracts shared by the fullscreen controller, the useFullscreen hook, ControlPanel's fullscreen button and
// FullscreenLayer. Each piece is built separately against these, so change them only together with every user.

// Which Fullscreen API the browser offers: the standard one, Safari's older webkit-prefixed one, or none (iPhone Safari,
// or fullscreen disabled by a policy or an iframe without allow="fullscreen"), which means pseudo-fullscreen.
export type FullscreenSupport = 'native' | 'webkit' | 'none';

// 'native' covers both the standard and the webkit API (the browser owns the fullscreen state); 'pseudo' is the app's
// own CSS fallback, where the app also has to handle Escape.
export type FullscreenMode = 'off' | 'native' | 'pseudo';

// Which exit hint to show: 'touch' for a coarse pointer (matchMedia('(pointer: coarse)'), read on entry).
export type FullscreenHint = 'keyboard' | 'touch';

// A thin wrapper over the (standard or webkit) Fullscreen API of one document, so the hook can be tested with a fake.
export interface FullscreenController {
    readonly support: FullscreenSupport;
    // Resolves true once the browser accepted the request, false when support is 'none' or the request was rejected.
    // Never rejects.
    enter(element: HTMLElement): Promise<boolean>;
    // Leaves fullscreen if the document is in it; never rejects.
    exit(): Promise<void>;
    // True while `element` is the document's (standard or webkit) fullscreen element.
    isActive(element: HTMLElement): boolean;
    // Calls `listener` on every (webkit)fullscreenchange; returns the unsubscribe function.
    subscribe(listener: () => void): () => void;
}

export interface UseFullscreenResult {
    // True in both 'native' and 'pseudo' mode.
    active: boolean;
    mode: FullscreenMode;
    // The hint for the current (or most recent) entry; 'keyboard' before the first entry.
    hint: FullscreenHint;
    toggle(): void;
    exit(): void;
}

export interface FullscreenLayerProps {
    active: boolean;
    hint: FullscreenHint;
    onExit(): void;
}

// The attribute ControlPanel puts on its fullscreen button. useFullscreen finds the button by it to give the button
// focus back after fullscreen ends, once the control bar is visible again.
export const FULLSCREEN_TOGGLE_ATTRIBUTE = 'data-fullscreen-toggle';

// The classes useFullscreen adds to the fullscreen target after 2 s without mouse movement, and removes on the next
// move and on exit. They hide the cursor on the target and everything in it: `!` beats the inline cursor style
// OrbitControls can put on the canvas. Literal strings, so Tailwind generates them. The target's own className must be
// a static string, because React would drop classes added this way if it ever rewrote the attribute.
export const FULLSCREEN_IDLE_CURSOR_CLASSES = ['cursor-none!', '**:cursor-none!'] as const;

// How long the hint toast and the touch exit button stay up, and how long the mouse must rest before the cursor hides.
export const FULLSCREEN_HINT_MS = 3000;
export const FULLSCREEN_EXIT_BUTTON_MS = 3000;
export const FULLSCREEN_IDLE_CURSOR_MS = 2000;

// A pointerup counts as a tap (revealing the touch exit button) only within these limits of its pointerdown, so a drag
// that orbits the camera does not reveal it.
export const FULLSCREEN_TAP_MAX_MOVE_PX = 10;
export const FULLSCREEN_TAP_MAX_MS = 300;
