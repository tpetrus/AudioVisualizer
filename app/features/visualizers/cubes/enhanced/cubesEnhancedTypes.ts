import type * as THREE from 'three';
import type { SceneSize } from '~/hooks/useThreeScene';

// Frozen contracts C3 and C4 (docs/plans/cubes-enhanced-graphics/contracts.md). Type-only, so the eager cubes chunk can
// import it without pulling in the lazy enhanced look. A change here is an escalation to the orchestrator.

// The scene's lights, created by useCubesScene. The enhanced look retunes them and puts them back on dispose.
export interface CubesLights {
    key: THREE.DirectionalLight;
    fill: THREE.DirectionalLight;
    ambient: THREE.AmbientLight;
}

export interface CubesEnhancedLookOptions {
    renderer: THREE.WebGLRenderer;
    scene: THREE.Scene;
    camera: THREE.PerspectiveCamera;
    lights: CubesLights;
    // CSS pixels, as useThreeScene reports them.
    size: SceneSize;
    reducedMotion: boolean;
}

// The enhanced-only controls (C7) and the colors the basic look already uses. Colors are the hook's preallocated
// instances: read them, never keep or change them.
export interface CubesEnhancedSettings {
    glow: number; // 0..1
    particles: number; // 0..1; 0 hides the particle layer
    cameraMotion: number; // 0..1
    restingColor: THREE.Color;
    raisedColor: THREE.Color;
}

// One frame of audio input for the enhanced look, filled in place by useCubesScene.
export interface CubesFxFrame {
    bands: Float32Array | null; // the cubes' band levels (0..1); null when no analyser is bound
    bassFlash: number; // 0..1, the cubesBass pulse the basic look flashes its background with
    beatPhase: number | null; // hub beat phase while hub.snapshot.beat.locked, else null
    barPhase: number | null; // hub bar phase while hub.snapshot.beat.barLocked, else null
    barLocked: boolean;
    dt: number; // seconds; CubesFxState clamps it to 0..0.1
}

// What CubesFxState.step writes, in place, once per frame.
export interface CubesFxUniforms {
    time: number; // seconds of accumulated dt
    bloomStrength: number; // 0..1 drive; the look scales it by settings.glow and its configured maximum
    bassFlash: number; // 0..1; capped by the reduced-motion damper
    waveAmplitude: number; // 0..1; 0 while beatPhase is null
    wavePhase: number; // radians; holds its value while beatPhase is null
    shatter: number; // 0..1, a bass-drop impulse that decays; capped by the reduced-motion damper
    particleEmit: number; // 0..1, follows bass and band energy
    motionDolly: number; // -1..1; 0 under reduced motion or while barPhase is null
    motionDrift: number; // -1..1; 0 under reduced motion
}

// The class API of CubesEnhancedLook (C3), so the hook and its tests depend on the shape, not the lazy module.
export interface CubesEnhancedLookApi {
    attach(grid: CubeGridLike): void;
    update(frame: Readonly<CubesFxFrame>, settings: Readonly<CubesEnhancedSettings>): void;
    render(): void;
    resize(width: number, height: number): void;
    setReducedMotion(reduced: boolean): void;
    dispose(): void;
}

// The part of CubeGrid the look uses (C6), so this file needs no runtime import of the grid.
export interface CubeGridLike {
    readonly mesh: THREE.InstancedMesh;
    readonly columns: number;
    readonly rows: number;
    setMaterialOverride(material: THREE.Material | null): void;
}

export type CubesEnhancedLookConstructor = new (options: CubesEnhancedLookOptions) => CubesEnhancedLookApi;
