import type { FullscreenController, FullscreenSupport } from './types';

// Safari before 16.4 (and iPad Safari) only offers the webkit-prefixed API; the DOM typings do not know it.
interface WebkitFullscreenDocument {
    webkitFullscreenEnabled?: boolean;
    webkitFullscreenElement?: Element | null;
    webkitExitFullscreen?: () => unknown;
}

interface WebkitFullscreenElement {
    webkitRequestFullscreen?: () => unknown;
}

// Decides once which API the document offers. The element method is checked as well as the enabled flag, because a
// browser can report the flag without implementing the call on elements.
function detectSupport(doc: Document): FullscreenSupport {
    const root = doc.documentElement;
    if (doc.fullscreenEnabled === true && typeof root.requestFullscreen === 'function') return 'native';
    const webkitDoc = doc as Document & WebkitFullscreenDocument;
    const webkitRoot = root as HTMLElement & WebkitFullscreenElement;
    if (webkitDoc.webkitFullscreenEnabled === true && typeof webkitRoot.webkitRequestFullscreen === 'function') {
        return 'webkit';
    }
    return 'none';
}

// Wraps the standard or webkit Fullscreen API of one document behind one interface, so callers (and their tests) never
// branch on the prefix. None of its methods reject: fullscreen can always be refused, and that is not an error.
export function createFullscreenController(doc: Document): FullscreenController {
    const support = detectSupport(doc);
    const webkitDoc = doc as Document & WebkitFullscreenDocument;

    const fullscreenElement = (): Element | null =>
        (support === 'native' ? doc.fullscreenElement : webkitDoc.webkitFullscreenElement) ?? null;

    return {
        support,

        async enter(element) {
            if (support === 'none') return false;
            try {
                if (support === 'native') {
                    await element.requestFullscreen({ navigationUI: 'hide' });
                } else {
                    // The prefixed call may return undefined instead of a promise; awaiting handles both.
                    await (element as HTMLElement & WebkitFullscreenElement).webkitRequestFullscreen?.();
                }
                return true;
            } catch {
                return false;
            }
        },

        async exit() {
            if (support === 'none' || fullscreenElement() === null) return;
            try {
                if (support === 'native') await doc.exitFullscreen();
                else await webkitDoc.webkitExitFullscreen?.();
            } catch {
                // Already out, or the browser refused: either way there is nothing left to do.
            }
        },

        isActive(element) {
            return support !== 'none' && fullscreenElement() === element;
        },

        subscribe(listener) {
            if (support === 'none') return () => {};
            const type = support === 'native' ? 'fullscreenchange' : 'webkitfullscreenchange';
            doc.addEventListener(type, listener);
            return () => doc.removeEventListener(type, listener);
        },
    };
}
