import { describe, expect, it } from 'vitest';
import { BassBump, GATE_BASS_BUMP } from '~/features/audio/hub/bassBump';
import { type BassSwell, BassSwellShaper } from './bassInkBass';

const DT = 1 / 60;

// The hub's gate-input bass is a linear RMS level: a steady bassline with a kick pulse on top, at 60 fps.
function kickInput(frame: number, pulseStart: number): number {
    const inPulse = frame >= pulseStart && frame < pulseStart + 8;
    return inPulse ? 0.16 : 0.1;
}

describe('BassSwellShaper', () => {
    it('is 0 for silence and for bad input, which also leaves the running level alone', () => {
        const shaper = new BassSwellShaper();
        const out: BassSwell = { swell: 1, glow: 1 };
        for (const level of [0, -1, Number.NaN, Number.NEGATIVE_INFINITY, Number.POSITIVE_INFINITY]) {
            shaper.step(level, DT, out);
            expect(out).toEqual({ swell: 0, glow: 0 });
        }
    });

    it('rests at 0 on a bump that stays high, however high', () => {
        const shaper = new BassSwellShaper();
        const out: BassSwell = { swell: 0, glow: 0 };
        for (let frame = 0; frame < 300; frame++) {
            shaper.step(0.9, DT, out);
            // It starts mid-plateau, so even the first frame is at rest.
            expect(out).toEqual({ swell: 0, glow: 0 });
        }
    });

    it('swells on a rise above its running level, with glow equal to swell, clamped to 0..1', () => {
        const shaper = new BassSwellShaper();
        const out: BassSwell = { swell: 0, glow: 0 };
        shaper.step(0, DT, out);
        shaper.step(0.5, DT, out);
        const mid = out.swell;
        expect(mid).toBeGreaterThan(0);
        expect(out.glow).toBe(mid);
        shaper.step(1, DT, out);
        expect(out.swell).toBeGreaterThan(mid);
        expect(out.swell).toBeLessThanOrEqual(1);
        const big = new BassSwellShaper();
        big.step(0, DT, out);
        big.step(5, DT, out);
        expect(out).toEqual({ swell: 1, glow: 1 });
    });

    it('pulses on a plateau that starts and falls back to rest after it, and again on the next one', () => {
        const shaper = new BassSwellShaper();
        const out: BassSwell = { swell: 0, glow: 0 };
        const peaks: number[] = [];
        let peak = 0;
        for (let frame = 0; frame < 360; frame++) {
            // Two hits half a second apart, each held high for 0.4 s, from a quiet bass.
            const hit = (frame >= 60 && frame < 84) || (frame >= 180 && frame < 204);
            shaper.step(hit ? 0.9 : 0.05, DT, out);
            peak = Math.max(peak, out.swell);
            if (frame === 150 || frame === 270) {
                peaks.push(peak);
                peak = 0;
            }
        }
        expect(peaks[0]).toBeGreaterThan(0.6);
        expect(peaks[1]).toBeGreaterThan(0.6);
        expect(out.swell).toBe(0);
    });

    it('swells above 0.3 within 3 frames of a kick pulse starting, with no lock involved', () => {
        const bump = new BassBump(GATE_BASS_BUMP);
        const shaper = new BassSwellShaper();
        const out: BassSwell = { swell: 0, glow: 0 };
        const pulseStart = 600;
        let firstAbove = -1;
        let peak = 0;
        for (let frame = 0; frame < pulseStart + 90; frame++) {
            shaper.step(bump.step(kickInput(frame, pulseStart), DT), DT, out);
            expect(out.swell).toBeGreaterThanOrEqual(0);
            expect(out.swell).toBeLessThanOrEqual(1);
            expect(out.glow).toBeLessThanOrEqual(1);
            // The unseeded envelope reads its first several seconds as bumps (see GATE_BASS_BUMP), so only check after that.
            if (frame >= 480 && frame < pulseStart) {
                expect(out.swell).toBe(0);
            }
            if (frame >= pulseStart && out.swell > 0.3 && firstAbove < 0) {
                firstAbove = frame - pulseStart;
            }
            peak = Math.max(peak, out.swell);
        }
        // Frame 0 is the first frame of the pulse, so "within 3 frames" is index 0, 1 or 2.
        expect(firstAbove).toBeGreaterThanOrEqual(0);
        expect(firstAbove).toBeLessThanOrEqual(2);
        expect(peak).toBeGreaterThan(0.6);
        // It settles back to rest after the pulse.
        expect(out.swell).toBeLessThan(0.05);
    });

    it('stays at 0 on steady bass and on silence', () => {
        const bump = new BassBump(GATE_BASS_BUMP);
        const shaper = new BassSwellShaper();
        const out: BassSwell = { swell: 0, glow: 0 };
        for (let frame = 0; frame < 600; frame++) {
            shaper.step(bump.step(frame < 300 ? 0.1 : 0, DT), DT, out);
            if (frame > 240) {
                expect(out.swell).toBe(0);
            }
        }
    });

    it('does not move the running level on a zero, negative or NaN delta, and caps a stalled frame', () => {
        const out: BassSwell = { swell: 0, glow: 0 };
        // With no time passing the level stays at the first input, so the same rise reads the same every time.
        const frozen = new BassSwellShaper();
        frozen.step(0, DT, out);
        for (const dt of [0, -1, Number.NaN]) {
            frozen.step(1, dt, out);
            expect(out.swell).toBe(1);
        }
        // A 10 s stall moves the level no further than a 0.1 s step does.
        const stalled = new BassSwellShaper();
        const capped = new BassSwellShaper();
        stalled.step(0, DT, out);
        capped.step(0, DT, out);
        stalled.step(1, 10, out);
        capped.step(1, 0.1, out);
        stalled.step(1, DT, out);
        const afterStall = out.swell;
        capped.step(1, DT, out);
        expect(afterStall).toBe(out.swell);
    });

    it('reads the same at 30 and 120 fps', () => {
        const run = (fps: number): number => {
            const shaper = new BassSwellShaper();
            const out: BassSwell = { swell: 0, glow: 0 };
            for (let i = 0; i < fps; i++) shaper.step(0.05, 1 / fps, out);
            for (let i = 0; i < Math.round(fps * 0.1); i++) shaper.step(0.9, 1 / fps, out);
            // A zero-length step reads the level the frames left behind without moving it.
            shaper.step(0.9, 0, out);
            return out.swell;
        };
        expect(run(30)).toBeCloseTo(run(120), 2);
    });
});
