export type CubesEnhancedModule = typeof import('./CubesEnhancedLook');
export type LoadCubesEnhancedResult = { ok: true; Look: CubesEnhancedModule['CubesEnhancedLook'] } | { ok: false };

// The only importer of the enhanced look, so the look, its shaders and the post-processing addons land in a lazy chunk
// that is requested only when the visitor chose enhanced graphics. Never rejects: a failure or an abort is `ok: false`,
// and the caller keeps the basic look. `importer` is for tests only.
export function loadCubesEnhanced(
    signal: AbortSignal,
    importer: () => Promise<CubesEnhancedModule> = () => import('./CubesEnhancedLook'),
): Promise<LoadCubesEnhancedResult> {
    if (signal.aborted) return Promise.resolve({ ok: false });

    return new Promise<LoadCubesEnhancedResult>((resolve) => {
        const onAbort = () => resolve({ ok: false });
        signal.addEventListener('abort', onAbort, { once: true });
        // Settled by whichever comes first: resolving twice is harmless, so an abort after the import is ignored.
        importer().then(
            (module) => {
                signal.removeEventListener('abort', onAbort);
                resolve(signal.aborted ? { ok: false } : { ok: true, Look: module.CubesEnhancedLook });
            },
            (error: unknown) => {
                signal.removeEventListener('abort', onAbort);
                if (!signal.aborted) console.warn('Enhanced cubes could not be loaded, using the basic look.', error);
                resolve({ ok: false });
            },
        );
    });
}
