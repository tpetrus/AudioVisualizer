import { cubesEnhancedConfig } from './cubesEnhancedConfig';
import type { CubesFxFrame, CubesFxUniforms } from './cubesEnhancedTypes';

export type { CubesFxFrame, CubesFxUniforms } from './cubesEnhancedTypes';

const TURN = Math.PI * 2;

// `time` wraps at this period so the particle shader's float32 uniform keeps its precision over a long session. The
// particle positions and the cube shimmer jump once per wrap (an hour); the drift keeps its own wrapped phases, so it
// stays continuous.
const TIME_PERIOD = 3600;

// 0..1, and 0 for NaN (every comparison with NaN is false, so it falls through to 0).
function clamp01(value: number): number {
    return value > 0 ? (value < 1 ? value : 1) : 0;
}

// -1..1, and 0 for NaN.
function clampSigned(value: number): number {
    return value > -1 ? (value < 1 ? value : 1) : value <= -1 ? -1 : 0;
}

// A finite number, else 0.
function finiteOrZero(value: number): number {
    return Number.isFinite(value) ? value : 0;
}

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

// Turns one frame of audio and rhythm input into the uniforms the enhanced look draws with. Pure maths over a few
// numbers kept between frames: `step` writes into `out` and allocates nothing. Every output is finite and inside its
// range whatever the input, including NaN, so a bad frame can never reach a shader.
export class CubesFxState {
    private time = 0;
    // The drift's two sine phases, kept in 0..TURN so they do not jump when `time` wraps.
    private driftPhaseA = 0;
    private driftPhaseB = 0;
    private wavePhase = 0;
    private waveAmplitude = 0;
    private dollyGain = 0;
    private emit = 0;
    private shatter = 0;
    private shatterCooldown = 0;
    // The flash's own slow average; a drop is the flash running well ahead of it.
    private slowFlash = 0;

    step(frame: Readonly<CubesFxFrame>, reducedMotion: boolean, out: CubesFxUniforms): void {
        const config = cubesEnhancedConfig.fx;
        const dt = Math.min(config.maxDt, Math.max(0, finiteOrZero(frame.dt)));
        this.time = (this.time + dt) % TIME_PERIOD;
        this.driftPhaseA = (this.driftPhaseA + dt * config.driftRateA) % TURN;
        this.driftPhaseB = (this.driftPhaseB + dt * config.driftRateB) % TURN;

        const flash = clamp01(frame.bassFlash);
        const bands = averageBands(frame.bands);

        // A drop: the flash jumps past its slow average. The impulse then decays on its own clock.
        const rise = flash - this.slowFlash;
        this.shatter *= Math.exp(-dt / config.shatterDecayTau);
        this.shatterCooldown = Math.max(0, this.shatterCooldown - dt);
        if (rise > config.shatterRise && flash > config.shatterMinFlash && this.shatterCooldown <= 0) {
            this.shatter = Math.max(this.shatter, flash);
            this.shatterCooldown = config.shatterCooldown;
        }
        this.slowFlash += (flash - this.slowFlash) * (1 - Math.exp(-dt / config.shatterSlowTau));

        // Emission rises fast and falls slowly, so a hit makes a burst that lingers.
        const emitTarget = clamp01(flash * config.emitFlash + bands * config.emitBands);
        const emitTau = emitTarget > this.emit ? config.emitAttack : config.emitRelease;
        this.emit += (emitTarget - this.emit) * (1 - Math.exp(-dt / emitTau));

        // The beat wave: no lock, no wave. The phase holds so the ripple resumes where it stopped.
        const beatPhase = frame.beatPhase;
        if (beatPhase !== null && Number.isFinite(beatPhase)) {
            this.wavePhase = (beatPhase - Math.floor(beatPhase)) * TURN;
            const target = clamp01(config.waveBase + flash * config.waveFlash);
            this.waveAmplitude = Math.min(target, this.waveAmplitude + dt * config.waveRamp);
        } else {
            this.waveAmplitude = 0;
        }

        // The dolly follows the bar; it needs a confident meter and eases in so a late lock does not jump.
        const barPhase = frame.barPhase;
        let dolly = 0;
        if (frame.barLocked && barPhase !== null && Number.isFinite(barPhase)) {
            this.dollyGain = Math.min(1, this.dollyGain + dt * config.dollyRamp);
            dolly = Math.cos(barPhase * TURN) * this.dollyGain;
        } else {
            this.dollyGain = 0;
        }
        const drift = 0.6 * Math.sin(this.driftPhaseA) + 0.4 * Math.sin(this.driftPhaseB + 1.3);

        const drive = clamp01(config.bloomBase + flash * config.bloomFlash + bands * config.bloomBands);

        out.time = this.time;
        out.particleEmit = clamp01(this.emit);
        out.wavePhase = this.wavePhase;
        if (reducedMotion) {
            const cap = config.reduced;
            out.bassFlash = Math.min(flash, cap.bassFlashMax);
            out.shatter = Math.min(clamp01(this.shatter), cap.shatterMax);
            out.bloomStrength = Math.min(drive, cap.bloomMax);
            out.waveAmplitude = Math.min(clamp01(this.waveAmplitude), cap.waveMax);
            out.motionDolly = 0;
            out.motionDrift = 0;
        } else {
            out.bassFlash = flash;
            out.shatter = clamp01(this.shatter);
            out.bloomStrength = drive;
            out.waveAmplitude = clamp01(this.waveAmplitude);
            out.motionDolly = clampSigned(dolly);
            out.motionDrift = clampSigned(drift);
        }
    }

    reset(): void {
        this.time = 0;
        this.driftPhaseA = 0;
        this.driftPhaseB = 0;
        this.wavePhase = 0;
        this.waveAmplitude = 0;
        this.dollyGain = 0;
        this.emit = 0;
        this.shatter = 0;
        this.shatterCooldown = 0;
        this.slowFlash = 0;
    }
}

// The mean of the band levels, each clamped to 0..1; null or empty reads as silence.
function averageBands(bands: Float32Array | null): number {
    if (!bands || bands.length === 0) return 0;
    let sum = 0;
    for (let i = 0; i < bands.length; i++) sum += clamp01(bands[i]);
    return sum / bands.length;
}
