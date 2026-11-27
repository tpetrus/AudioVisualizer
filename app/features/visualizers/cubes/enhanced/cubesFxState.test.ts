import { describe, expect, it } from 'vitest';
import { cubesEnhancedConfig } from './cubesEnhancedConfig';
import { createCubesFxUniforms, CubesFxState, type CubesFxFrame, type CubesFxUniforms } from './cubesFxState';

const { fx: config } = cubesEnhancedConfig;

function frame(overrides: Partial<CubesFxFrame> = {}): CubesFxFrame {
    return { bands: null, bassFlash: 0, beatPhase: null, barPhase: null, barLocked: false, dt: 1 / 60, ...overrides };
}

function run(state: CubesFxState, input: CubesFxFrame, steps: number, reduced = false): CubesFxUniforms {
    const out = createCubesFxUniforms();
    for (let i = 0; i < steps; i++) state.step(input, reduced, out);
    return out;
}

function expectInRange(out: CubesFxUniforms) {
    for (const value of Object.values(out)) expect(Number.isFinite(value)).toBe(true);
    expect(out.time).toBeGreaterThanOrEqual(0);
    expect(out.bloomStrength).toBeGreaterThanOrEqual(0);
    expect(out.bloomStrength).toBeLessThanOrEqual(1);
    for (const key of ['bassFlash', 'waveAmplitude', 'shatter', 'particleEmit'] as const) {
        expect(out[key]).toBeGreaterThanOrEqual(0);
        expect(out[key]).toBeLessThanOrEqual(1);
    }
    for (const key of ['motionDolly', 'motionDrift'] as const) {
        expect(Math.abs(out[key])).toBeLessThanOrEqual(1);
    }
}

describe('createCubesFxUniforms', () => {
    it('is all zeros', () => {
        expect(Object.values(createCubesFxUniforms()).every((value) => value === 0)).toBe(true);
    });
});

describe('CubesFxState', () => {
    it('writes the object it is given, in place', () => {
        const out = createCubesFxUniforms();
        new CubesFxState().step(frame({ bassFlash: 0.5 }), false, out);
        expect(out.bassFlash).toBe(0.5);
        expect(out.time).toBeGreaterThan(0);
    });

    it('clamps dt to 0..0.1 and ignores a negative or NaN one', () => {
        const state = new CubesFxState();
        const out = createCubesFxUniforms();
        state.step(frame({ dt: 5 }), false, out);
        expect(out.time).toBeCloseTo(0.1);
        state.step(frame({ dt: -3 }), false, out);
        expect(out.time).toBeCloseTo(0.1);
        state.step(frame({ dt: Number.NaN }), false, out);
        expect(out.time).toBeCloseTo(0.1);
    });

    it('keeps every output finite and in range for NaN, infinite and out-of-range input', () => {
        const state = new CubesFxState();
        const bad = new Float32Array([Number.NaN, Infinity, -Infinity, 7, -2]);
        const inputs = [
            frame({ bands: bad, bassFlash: Number.NaN, beatPhase: Number.NaN, barPhase: Number.NaN, barLocked: true }),
            frame({ bands: bad, bassFlash: Infinity, beatPhase: Infinity, barPhase: -Infinity, barLocked: true }),
            frame({ bassFlash: 9, beatPhase: 123.4, barPhase: 55.5, barLocked: true, dt: Number.POSITIVE_INFINITY }),
            frame({ bassFlash: -4, beatPhase: -0.25, barPhase: -0.25, barLocked: true }),
        ];
        for (const input of inputs) {
            for (const reduced of [false, true]) {
                expectInRange(run(state, input, 5, reduced));
            }
        }
    });

    it('reads null bands as silence and follows the band levels otherwise', () => {
        const silent = run(new CubesFxState(), frame({ bands: null }), 120);
        expect(silent.particleEmit).toBe(0);
        const loud = run(new CubesFxState(), frame({ bands: new Float32Array([1, 1, 1, 1]) }), 120);
        expect(loud.particleEmit).toBeGreaterThan(0.3);
        expect(loud.bloomStrength).toBeGreaterThan(silent.bloomStrength);
        expect(run(new CubesFxState(), frame({ bands: new Float32Array(0) }), 5).particleEmit).toBe(0);
    });

    it('lets the particle emission rise on a hit and fall off slowly', () => {
        const state = new CubesFxState();
        const hit = run(state, frame({ bassFlash: 1 }), 30);
        expect(hit.particleEmit).toBeGreaterThan(0.4);
        const after = run(state, frame({ bassFlash: 0 }), 6);
        expect(after.particleEmit).toBeGreaterThan(0);
        expect(after.particleEmit).toBeLessThan(hit.particleEmit);
    });

    it('gives zero wave amplitude with a null beat phase and holds the wave phase', () => {
        const state = new CubesFxState();
        const locked = run(state, frame({ beatPhase: 0.25 }), 120);
        expect(locked.waveAmplitude).toBeGreaterThan(0);
        expect(locked.wavePhase).toBeCloseTo(Math.PI / 2);
        const out = createCubesFxUniforms();
        state.step(frame({ beatPhase: null }), false, out);
        expect(out.waveAmplitude).toBe(0);
        expect(out.wavePhase).toBeCloseTo(Math.PI / 2);
    });

    it('fades the wave in after a lock rather than jumping', () => {
        const out = run(new CubesFxState(), frame({ beatPhase: 0.5 }), 1);
        expect(out.waveAmplitude).toBeGreaterThan(0);
        expect(out.waveAmplitude).toBeLessThan(config.waveBase);
    });

    it('gives zero dolly for a null bar phase or while the bar is not locked', () => {
        const state = new CubesFxState();
        expect(run(state, frame({ barPhase: 0, barLocked: false }), 30).motionDolly).toBe(0);
        expect(run(state, frame({ barPhase: null, barLocked: true }), 30).motionDolly).toBe(0);
    });

    it('swings the dolly with the bar once it is locked, easing in', () => {
        const state = new CubesFxState();
        const first = run(state, frame({ barPhase: 0, barLocked: true }), 1);
        expect(first.motionDolly).toBeGreaterThan(0);
        expect(first.motionDolly).toBeLessThan(1);
        const full = run(state, frame({ barPhase: 0, barLocked: true }), 120);
        expect(full.motionDolly).toBeCloseTo(1);
        expect(run(state, frame({ barPhase: 0.5, barLocked: true }), 1).motionDolly).toBeCloseTo(-1);
        // Losing the lock drops the gain, so a relock eases in again.
        run(state, frame({ barPhase: null, barLocked: false }), 1);
        expect(run(state, frame({ barPhase: 0, barLocked: true }), 1).motionDolly).toBeLessThan(0.1);
    });

    it('drifts slowly and stays inside -1..1', () => {
        const state = new CubesFxState();
        const out = createCubesFxUniforms();
        let moved = false;
        for (let i = 0; i < 3000; i++) {
            state.step(frame({ dt: 0.1 }), false, out);
            expect(Math.abs(out.motionDrift)).toBeLessThanOrEqual(1);
            if (Math.abs(out.motionDrift) > 0.1) moved = true;
        }
        expect(moved).toBe(true);
    });

    describe('shatter', () => {
        it('stays at 0 for a steady flash and for a rise below the threshold', () => {
            const steady = run(new CubesFxState(), frame({ bassFlash: 0.2 }), 120);
            expect(steady.shatter).toBe(0);
            const gentle = new CubesFxState();
            const out = createCubesFxUniforms();
            for (let i = 0; i < 600; i++) {
                gentle.step(frame({ bassFlash: 0.1 + 0.5 * (i / 600) }), false, out);
                expect(out.shatter).toBe(0);
            }
        });

        it('is an impulse on a bass drop that decays', () => {
            const state = new CubesFxState();
            run(state, frame({ bassFlash: 0 }), 30);
            const hit = run(state, frame({ bassFlash: 0.9 }), 1);
            expect(hit.shatter).toBeCloseTo(0.9, 1);
            const later = run(state, frame({ bassFlash: 0.9 }), 30);
            expect(later.shatter).toBeLessThan(hit.shatter * 0.5);
            expect(run(state, frame({ bassFlash: 0.9 }), 120).shatter).toBeLessThan(0.01);
        });

        it('does not retrigger inside the cooldown', () => {
            const state = new CubesFxState();
            const out = createCubesFxUniforms();
            run(state, frame({ bassFlash: 0 }), 30);
            state.step(frame({ bassFlash: 0.9 }), false, out);
            const first = out.shatter;
            state.step(frame({ bassFlash: 0 }), false, out);
            state.step(frame({ bassFlash: 0.9 }), false, out);
            // Decayed twice, not re-struck to 0.9.
            expect(out.shatter).toBeLessThan(first);
        });
    });

    describe('reduced motion', () => {
        it('zeroes the dolly and drift and caps the flash, shatter, wave and bloom', () => {
            const input = frame({
                bassFlash: 1,
                beatPhase: 0.3,
                barPhase: 0,
                barLocked: true,
                bands: new Float32Array([1, 1]),
            });
            const state = new CubesFxState();
            run(state, frame({ bassFlash: 0 }), 30, true);
            const out = run(state, input, 120, true);
            expect(out.motionDolly).toBe(0);
            expect(out.motionDrift).toBe(0);
            expect(out.bassFlash).toBeLessThanOrEqual(config.reduced.bassFlashMax);
            expect(out.shatter).toBeLessThanOrEqual(config.reduced.shatterMax);
            expect(out.bloomStrength).toBeLessThanOrEqual(config.reduced.bloomMax);
            expect(out.waveAmplitude).toBeLessThanOrEqual(config.reduced.waveMax);

            const full = run(new CubesFxState(), input, 120, false);
            expect(full.bassFlash).toBe(1);
            expect(full.bloomStrength).toBeGreaterThan(config.reduced.bloomMax);
        });

        it('caps a drop even on its first frame, and switches back live', () => {
            const state = new CubesFxState();
            const out = createCubesFxUniforms();
            state.step(frame({ bassFlash: 0 }), true, out);
            state.step(frame({ bassFlash: 1 }), true, out);
            expect(out.shatter).toBeLessThanOrEqual(config.reduced.shatterMax);
            state.step(frame({ bassFlash: 1, barPhase: 0, barLocked: true }), false, out);
            expect(out.motionDolly).toBeGreaterThan(0);
        });
    });

    it('reset returns to the start', () => {
        const state = new CubesFxState();
        run(state, frame({ bassFlash: 1, beatPhase: 0.5, barPhase: 0, barLocked: true }), 60);
        state.reset();
        const out = createCubesFxUniforms();
        state.step(frame({ dt: 0.05 }), false, out);
        expect(out.time).toBeCloseTo(0.05);
        expect(out.shatter).toBe(0);
        expect(out.particleEmit).toBe(0);
        expect(out.wavePhase).toBe(0);
    });
});
