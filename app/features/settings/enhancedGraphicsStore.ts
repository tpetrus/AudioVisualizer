export const ENHANCED_GRAPHICS_KEY = 'audioVisualizer.enhancedGraphics';

const listeners = new Set<() => void>();

// localStorage can throw (private mode, blocked storage), so anything but the exact string 'true' reads as off.
export function getEnhancedGraphics(): boolean {
    try {
        return localStorage.getItem(ENHANCED_GRAPHICS_KEY) === 'true';
    } catch {
        return false;
    }
}

// Listeners are told even when the write throws, so the tab that clicked still re-reads and shows what is stored.
export function setEnhancedGraphics(on: boolean): void {
    try {
        localStorage.setItem(ENHANCED_GRAPHICS_KEY, on ? 'true' : 'false');
    } catch {
        // Nothing to do: the preference then reads as off, which is the safe standard look.
    }
    notify();
}

function notify(): void {
    for (const listener of [...listeners]) {
        listener();
    }
}

// A `storage` event only fires in other tabs, which is what keeps them in sync; same-tab changes notify directly.
function onStorage(event: StorageEvent): void {
    if (event.key === ENHANCED_GRAPHICS_KEY || event.key === null) {
        notify();
    }
}

export function subscribeEnhancedGraphics(listener: () => void): () => void {
    if (listeners.size === 0) {
        window.addEventListener('storage', onStorage);
    }
    listeners.add(listener);
    return () => {
        listeners.delete(listener);
        if (listeners.size === 0) {
            window.removeEventListener('storage', onStorage);
        }
    };
}
