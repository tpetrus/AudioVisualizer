import { vi } from 'vitest';

// Test-only helper (never imported by app code, so it is not shipped). GLTFLoader decodes embedded textures through an
// <img> element, which the node environment lacks. This stand-in answers "loaded", so the loader builds its Texture
// objects (app/test/setup.ts unstubs the globals after each test).
export function stubGltfImageElement(): void {
    vi.stubGlobal('self', globalThis);
    vi.stubGlobal('document', {
        createElementNS: () => {
            const listeners = new Map<string, () => void>();
            return {
                width: 1,
                height: 1,
                addEventListener: (type: string, listener: () => void) => listeners.set(type, listener),
                removeEventListener: (type: string) => listeners.delete(type),
                set src(_value: string) {
                    queueMicrotask(() => listeners.get('load')?.());
                },
            };
        },
    });
}
