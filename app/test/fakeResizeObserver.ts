import { vi } from 'vitest';

// jsdom has no ResizeObserver, and useThreeScene needs one. This fake never fires on its own; the spec calls
// `resize(width, height)` to play the browser.
//
//   const resizes = installFakeResizeObserver();
//   render(<Scene />);
//   resizes.resize(800, 600);         // every live observer; or resizes.last.resize(800, 600)

export class FakeResizeObserver {
    readonly observe = vi.fn((_target: Element) => { });
    readonly unobserve = vi.fn((_target: Element) => { });
    readonly disconnect = vi.fn(() => { });

    constructor(readonly callback: ResizeObserverCallback) { }

    // Calls the callback with one entry, shaped like a real one for the members the app reads (`contentRect`).
    // Fractional sizes are allowed: useThreeScene rounds them. The target is whatever was passed to `observe`.
    resize(width: number, height: number): void {
        const target = this.observe.mock.calls[0]?.[0] ?? document.createElement('div');
        const contentRect = { width, height, x: 0, y: 0, top: 0, left: 0, right: width, bottom: height, toJSON: () => ({}) };
        this.callback([{ target, contentRect } as unknown as ResizeObserverEntry], this as unknown as ResizeObserver);
    }
}

export interface InstalledResizeObservers {
    // Every observer constructed so far, in order.
    readonly instances: FakeResizeObserver[];
    readonly last: FakeResizeObserver;
    // Fires every observer that has not been disconnected (a torn-down scene must not hear resizes).
    resize(width: number, height: number): void;
}

export function installFakeResizeObserver(): InstalledResizeObservers {
    const instances: FakeResizeObserver[] = [];
    class RecordingResizeObserver extends FakeResizeObserver {
        constructor(callback: ResizeObserverCallback) {
            super(callback);
            instances.push(this);
        }
    }
    vi.stubGlobal('ResizeObserver', RecordingResizeObserver);

    return {
        instances,
        get last() {
            const observer = instances[instances.length - 1];
            if (!observer) throw new Error('No ResizeObserver has been created yet');
            return observer;
        },
        resize(width, height) {
            instances.filter(observer => observer.disconnect.mock.calls.length === 0)
                .forEach(observer => observer.resize(width, height));
        },
    };
}
