import { vi } from 'vitest';
import type { FullscreenSupport } from '~/features/fullscreen/types';

// jsdom has no Fullscreen API. This fake patches `document` and `HTMLElement.prototype` the way a browser with the
// standard ('native'), the webkit-prefixed ('webkit') or no ('none') API looks, and plays the browser: a request makes
// the element the fullscreen element and dispatches the (webkit)fullscreenchange event on the document.
//
//   const fullscreen = installFakeFullscreen({ support: 'native' });
//   afterEach(() => fullscreen.restore());     // setup.ts only undoes vi.stubGlobal, so restoring is the spec's job
//   ...
//   await act(async () => result.current.toggle());
//   expect(fullscreen.element).toBe(target);   // the fullscreen element, null when not in fullscreen
//   act(() => fullscreen.exitExternally());    // the browser's own Escape or exit UI
//
// `webkitError: true` makes a webkit request fail the way Safari does: no promise, a webkitfullscreenerror event.
// `reject: true` makes every request reject (a policy block or a refused request). `requestCalls` counts requests and
// `exitCalls` counts exitFullscreen calls made by the code under test (not exitExternally).

export interface FakeFullscreen {
    // The current fullscreen element, or null.
    readonly element: Element | null;
    readonly requestCalls: ReturnType<typeof vi.fn>;
    readonly exitCalls: ReturnType<typeof vi.fn>;
    // Leaves fullscreen the way the browser does on Escape: clears the element and dispatches the change event.
    exitExternally(): void;
    // Puts every patched property back to what it was before the install.
    restore(): void;
}

interface Patch {
    target: object;
    key: string;
    descriptor: PropertyDescriptor | undefined;
}

export function installFakeFullscreen({
    support,
    reject = false,
    webkitError = false,
}: {
    support: FullscreenSupport;
    reject?: boolean;
    webkitError?: boolean;
}): FakeFullscreen {
    const patches: Patch[] = [];
    let element: Element | null = null;
    const requestCalls = vi.fn();
    const exitCalls = vi.fn();

    // Records the original descriptor (own property only) so restore can put it back or delete the patch.
    const patch = (target: object, key: string, descriptor: PropertyDescriptor) => {
        patches.push({ target, key, descriptor: Object.getOwnPropertyDescriptor(target, key) });
        Object.defineProperty(target, key, { configurable: true, ...descriptor });
    };

    const prefix = support === 'webkit';
    const eventName = prefix ? 'webkitfullscreenchange' : 'fullscreenchange';
    const names = prefix
        ? {
              enabled: 'webkitFullscreenEnabled',
              element: 'webkitFullscreenElement',
              exit: 'webkitExitFullscreen',
              request: 'webkitRequestFullscreen',
          }
        : {
              enabled: 'fullscreenEnabled',
              element: 'fullscreenElement',
              exit: 'exitFullscreen',
              request: 'requestFullscreen',
          };

    const setElement = (next: Element | null) => {
        element = next;
        document.dispatchEvent(new Event(eventName));
    };

    // Built once with a live getter: spreading it would freeze `element` at its first value.
    const fake: FakeFullscreen = {
        get element() {
            return element;
        },
        requestCalls,
        exitCalls,
        exitExternally: () => setElement(null),
        restore,
    };

    // The standard names are patched in every mode, so a 'webkit' or 'none' document reports "not enabled".
    patch(document, 'fullscreenEnabled', { get: () => support === 'native' });
    if (support === 'none') return fake;

    patch(document, names.enabled, { get: () => true });
    patch(document, names.element, { get: () => element });
    patch(document, names.exit, {
        value: () => {
            exitCalls();
            setElement(null);
            return prefix ? undefined : Promise.resolve();
        },
    });
    patch(HTMLElement.prototype, names.request, {
        value: function (this: Element) {
            requestCalls();
            if (reject) return prefix ? Promise.reject(new Error('refused')) : Promise.reject(new TypeError('refused'));
            if (webkitError) {
                Promise.resolve().then(() => document.dispatchEvent(new Event('webkitfullscreenerror')));
                return undefined;
            }
            // A browser answers after the call returns, so the change event arrives later than the request.
            return Promise.resolve().then(() => setElement(this));
        },
    });

    function restore() {
        for (const { target, key, descriptor } of patches.reverse()) {
            if (descriptor) Object.defineProperty(target, key, descriptor);
            else delete (target as Record<string, unknown>)[key];
        }
        patches.length = 0;
        element = null;
    }

    return fake;
}
