// Frozen contracts shared by the Bass Ink modules (plan C1-C4). The pure set logic (energy, director, kicks, brightness,
// motion clock, palette, formations) and the scene (InkCloud, scene hook) are written against these shapes, so change
// them only together with every implementation.
//
// Every `nowSeconds` / `timeSeconds` in Bass Ink is the scene clock: seconds since the scene was built, summed from frame
// deltas. It is never AudioContext time, so the values stay small enough for float32 shader uniforms over a whole set.

// The phases of a set as the director sees them. A build tightens the cloud, a drop releases it into the next
// formation, and the afterglow is the settling time after a drop before another build can start.
export type DirectorPhase = 'groove' | 'build' | 'drop' | 'afterglow';

// Number of distinct rest formations (sphere, torus, double helix, disc).
export const FORMATION_COUNT = 4;

// How many recent kicks the shader sums as shockwaves.
export const KICK_SLOTS = 8;

// Level-independent loudness: fast and slow envelopes of the analyser RMS and their ratio. The ratio is about 1 for
// steady music, rises above 1 when the music gets louder than its recent past (a build or a drop) and falls below 1 in
// a breakdown, whatever the master level or capture gain.
export interface EnergyEnvelope {
    readonly fast: number;
    readonly slow: number;
    readonly ratio: number;
}

// C1: what the SetDirector decides, one mutable object reused every frame.
export interface DirectorCue {
    phase: DirectorPhase;
    // 0..1 build tension: 0 at rest, 1 at the build peak. Eases back to 0 after a drop.
    tension: number;
    // Scene time of the latest drop, or -1 before the first.
    dropAt: number;
    // The formation the cloud shows (or is fading from while a transition runs).
    formationIndex: number;
    // The formation the next transition goes to. Picked when a build starts (or when a transition is triggered with no
    // build before it), so the cloud can fill it in chunks before it is needed.
    nextFormationIndex: number;
    // Dominant pitch class 0..11 latched at the start of the latest transition; the palette follows it.
    paletteIndex: number;
    // Scene time the latest transition started, or -1 before the first.
    transitionStart: number;
    // Always the configured fixed length (2 s), not bar-relative, so a transition looks the same in every genre.
    transitionSeconds: number;
    // Monotonic: increases by one each time a transition starts, so the scene notices a new one by comparing counters.
    transitionCount: number;
}

// The kick ring as the scene and the cloud read it. Slots are written round-robin; an empty slot has a start time of
// -1e6 (so its wave is long gone) and strength 0.
export interface KickRingView {
    // KICK_SLOTS start times (scene seconds) and 0..1 strengths.
    readonly times: Float32Array;
    readonly strengths: Float32Array;
    // Monotonic count of recorded kicks.
    readonly count: number;
}

// Two colors the cloud is tinted with, in linear RGB 0..1, written in place: the dense core and the outer edge.
export interface PalettePair {
    readonly core: Float32Array;
    readonly edge: Float32Array;
}
