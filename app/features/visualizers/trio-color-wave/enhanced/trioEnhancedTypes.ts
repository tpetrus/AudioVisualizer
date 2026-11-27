// Contracts between the trio scene hook (always loaded) and the enhanced look (a lazy chunk). Type-only, so importing
// this file from the hook adds nothing to the standard bundle.
import type * as THREE from 'three';
import type { SceneSize } from '~/hooks/useThreeScene';
import type { RhythmTracker } from '~/features/rhythm/rhythmTracker';
import type { PencilFlagsMesh } from '~/features/visualizers/meshes/pencilFlagsMesh';
import type { TrioLookControlValues } from '../trioLookControls';

// The little of a MediaQueryList the look reads each frame. The hook owns the real query and its subscription.
export interface ReducedMotionSource {
    readonly matches: boolean;
}

export interface TrioEnhancedLookOptions {
    renderer: THREE.WebGLRenderer;
    scene: THREE.Scene;
    camera: THREE.PerspectiveCamera;
    // The standard sheets' meshes, front to back (highs, mids, bass). The look reads, never writes, their per-bar
    // heights (`heightAttribute.array`, flag = column * FLAG_DEPTH + row, already scaled to world units), their colors
    // (the `instanceColor` attribute) and their `mesh.position`. While the look is active it hides these meshes (or fades
    // them through their `opacity` uniform during a crossfade) and puts both back exactly as they were on dispose.
    sheets: readonly PencilFlagsMesh[];
    size: SceneSize;
    // Only the Look keys are read; the page's values table is a superset.
    valuesRef: { readonly current: TrioLookControlValues };
    // The app-wide tracker, or undefined (tests, a page without one): then accents come from nothing and never fire.
    rhythm: RhythmTracker | undefined;
    reducedMotion: ReducedMotionSource;
}

// What createTrioEnhancedLook returns. Allocates only in createTrioEnhancedLook; nothing per frame.
export interface TrioEnhancedLook {
    // Reads the sheets and rhythm, advances the accent, dust and shockwave by `dtSeconds`, and draws the whole frame
    // through the bloom composer (OutputPass applies ACES and the sRGB conversion once). Replaces renderer.render.
    render(dtSeconds: number): void;
    setSize(size: SceneSize): void;
    // 0 = invisible (standard meshes fully shown), 1 = fully enhanced (standard meshes hidden). Clamped to 0..1.
    setMix(mix: number): void;
    // Frees every GPU object the look created, removes them from the scene, puts the standard meshes back as they were.
    // Idempotent; render, setSize and setMix do nothing afterwards.
    dispose(): void;
}

export type CreateTrioEnhancedLook = (options: TrioEnhancedLookOptions) => TrioEnhancedLook;

// The beat accent's per-frame input. `beatCount` is RhythmState.beatCount (monotonic); `bassOnset` is
// RhythmState.bandOnsets[0] (0..1, kick band).
export interface TrioAccentInput {
    dtSeconds: number;
    beatCount: number;
    bassOnset: number;
    // The Beat accent slider, 0..1. 0 means the pulse stays at 0.
    intensity: number;
    reducedMotion: boolean;
}

// Mutated in place by stepTrioAccent.
export interface TrioAccentState {
    // 0..peak cap. Rises to its peak in the same step a trigger is accepted, then decays.
    pulse: number;
    // True only for the step in which a trigger was accepted (drives the shockwave ring).
    triggered: boolean;
    // Seconds since the last accepted trigger (Infinity before the first).
    sinceTrigger: number;
    // The last beatCount seen, or undefined before the first step (the first step never counts as a new beat).
    lastBeatCount: number | undefined;
    // Whether the previous step's bassOnset was above the trigger threshold (triggers fire on the rising edge).
    bassAbove: boolean;
}
