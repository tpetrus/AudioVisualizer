import type { CubesFxFrame, CubesFxUniforms } from './cubesEnhancedTypes';

export type { CubesFxFrame, CubesFxUniforms } from './cubesEnhancedTypes';

// All zeros: what the look shows before the first frame.
export function createCubesFxUniforms(): CubesFxUniforms {
    return {
        time: 0,
        bloomStrength: 0,
        bassFlash: 0,
        waveAmplitude: 0,
        wavePhase: 0,
        shatter: 0,
        particleEmit: 0,
        motionDolly: 0,
        motionDrift: 0,
    };
}

// Orchestrator stub of contract C4; task B replaces the body. Only `time` advances here.
export class CubesFxState {
    private time = 0;

    step(frame: Readonly<CubesFxFrame>, _reducedMotion: boolean, out: CubesFxUniforms): void {
        const dt = Number.isFinite(frame.dt) ? Math.min(0.1, Math.max(0, frame.dt)) : 0;
        this.time += dt;
        out.time = this.time;
    }

    reset(): void {
        this.time = 0;
    }
}
