// Tunables of the enhanced bass-ink look (bassInkEnhanced.ts). Every number that changes how it looks or how much it
// costs lives here. None of them follows the music: the look only adds static depth, sprite shape, grade and glow on top
// of the standard reactions, so it cannot add a flash of its own and `uBrightness` stays the only global brightness
// input.

// ---- Render scale ----

// The share of the drawing size the enhanced bloom runs at, from the full share down. The renderer's pixel ratio and the
// passes themselves never change; only the bloom's internal resolution does.
export const ENHANCED_RENDER_SCALES: readonly number[] = [1, 0.75, 0.5];
// Frames per measuring window. A full window is judged once, then a fresh one starts.
export const ENHANCED_FRAME_WINDOW = 120;
// The median frame time over a window must stay under this, or the scale steps down one level. A little above 60 fps
// so ordinary jitter at a steady 60 does not trigger a step.
export const ENHANCED_FRAME_BUDGET_SECONDS = 1 / 58;

// ---- Second bloom ----

// A wide, soft halo on top of the standard glow control's bloom. Fixed strength, so the glow slider keeps its meaning.
export const ENHANCED_BLOOM_STRENGTH = 0.5;
export const ENHANCED_BLOOM_RADIUS = 0.65;
// Only light above this blooms, so the faint dust does not smear.
export const ENHANCED_BLOOM_THRESHOLD = 0.7;
// The bloom's resolution as a share of the drawing size in device pixels (before the render scale). Wide and soft, so a
// third of the width costs about a ninth of the pixels and looks the same.
export const ENHANCED_BLOOM_RESOLUTION_SHARE = 0.35;
// Below this many device pixels on a side the bloom's mip chain would reach zero-size targets, so it is switched off.
export const ENHANCED_BLOOM_MIN_SIDE_PX = 32;

// ---- Color grade and vignette (one pass, linear light) ----

// Contrast pivots on linear middle gray, so shadows deepen a little and mids lift a little.
export const ENHANCED_GRADE_PIVOT = 0.18;
export const ENHANCED_GRADE_CONTRAST = 1.08;
export const ENHANCED_GRADE_SATURATION = 1.12;
// A filmic shoulder: channels above the knee roll off toward knee + range. It only compresses, and the pass never lets a
// pixel's brightest channel end above its value going in, so the grade cannot add peak light beyond what bloom gives.
export const ENHANCED_GRADE_KNEE = 0.8;
export const ENHANCED_GRADE_RANGE = 1.6;
// The vignette darkens toward the corners (0 at the center, 1 at the corner distance) between radius and radius + softness.
export const ENHANCED_VIGNETTE_STRENGTH = 0.35;
export const ENHANCED_VIGNETTE_RADIUS = 0.55;
export const ENHANCED_VIGNETTE_SOFTNESS = 0.6;

// ---- The ink cloud (shell and core) ----

export const ENHANCED_INK = {
    // The standard depth fade is multiplied by this (capped at fadeMax), so far points get fainter.
    fadeBoost: 1.45,
    fadeMax: 0.85,
    // Size of the nearest and the farthest points relative to the standard size. Near points are bigger, far ones smaller.
    nearSize: 1.15,
    farSize: 0.6,
    // Extra alpha at the nearest end of the depth range (quadratic, so only the closest points gain).
    nearGain: 0.12,
    // Extra point size that gives the halo room to fade out.
    spriteScale: 1.1,
    // The sprite profile: a body (the standard soft falloff), a wide linear halo and a tight hot core. With the sprite
    // scale their light per point (the profile's integral over the disc times the scale squared) is about the standard
    // sprite's, so the look is richer in shape, not in total light: a first tune with about 1.6 times the light clipped
    // the dense cloud to white on a real GPU.
    body: 0.5,
    halo: 0.12,
    core: 0.25,
    // How far the hot core's color moves toward white at the center of a point.
    coreWhite: 0.1,
} as const;

// ---- The dust ----

export const ENHANCED_DUST = {
    // View distances (world units) over which dust goes from near to far.
    near: 8,
    far: 50,
    nearSize: 1.8,
    farSize: 0.6,
    nearAlpha: 1.15,
    farAlpha: 0.5,
    spriteScale: 1.15,
    body: 0.55,
    halo: 0.12,
    core: 0.25,
} as const;

// ---- The spray ----

export const ENHANCED_SPRAY = {
    near: 6,
    far: 20,
    nearSize: 1.4,
    farSize: 0.7,
    nearAlpha: 1.15,
    farAlpha: 0.6,
    spriteScale: 1.15,
    body: 0.55,
    halo: 0.12,
    core: 0.25,
} as const;
