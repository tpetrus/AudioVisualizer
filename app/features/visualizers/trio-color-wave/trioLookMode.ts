export type TrioLookMode = 'standard' | 'enhanced';

// Set to true on `window` by an e2e init script only. CI draws with SwiftShader, which the software check would send to
// the standard look, so without it no end-to-end test could ever build the enhanced one. It only unlocks a look any
// visitor can already turn on with the Enhanced graphics switch, so it is safe to leave readable in production.
export const FORCE_HARDWARE_FLAG = '__audioVisualizerE2EForceHardware';

// The enhanced look is used only when the visitor asked for it and the GPU is real: a software rasterizer is far too
// slow for bloom and the denser bars, so it keeps the standard look whatever the preference says.
export function resolveTrioLookMode(enhanced: boolean, software: boolean): TrioLookMode {
    return enhanced && !software ? 'enhanced' : 'standard';
}

// True when an e2e run asked for the software check to be ignored (see FORCE_HARDWARE_FLAG).
export function isHardwareForced(): boolean {
    return (
        typeof window !== 'undefined' && (window as unknown as Record<string, unknown>)[FORCE_HARDWARE_FLAG] === true
    );
}
