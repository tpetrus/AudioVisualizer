import { describe, expect, it } from 'vitest';
import { BassBump, GATE_BASS_BUMP } from '~/features/audio/hub/bassBump';
import { type BassSwell, swellFromBump } from './bassInkBass';

const DT = 1 / 60;

// The hub's gate-input bass is a linear RMS level: a steady bassline with a kick pulse on top, at 60 fps.
function kickInput(frame: number, pulseStart: number): number {
    const inPulse = frame >= pulseStart && frame < pulseStart + 8;
    return inPulse ? 0.16 : 0.1;
}

describe('swellFromBump', () => {
    it('is 0 for silence, the noise floor and bad input', () => {
        const out: BassSwell = { swell: 1, glow: 1 };
        for (const level of [0, bassFloor(), -1, Number.NaN, Number.NEGATIVE_INFINITY]) {
            swellFromBump(level, out);
            expect(out).toEqual({ swell: 0, glow: 0 });
        }
    });

    it('rises with the bump and is clamped to 0..1', () => {
        const out: BassSwell = { swell: 0, glow: 0 };
        swellFromBump(0.15, out);
        const low = out.swell;
        swellFromBump(0.3, out);
        expect(out.swell).toBeGreaterThan(low);
        swellFromBump(5, out);
        expect(out).toEqual({ swell: 1, glow: 1 });
    });

    it('swells above 0.3 within 3 frames of a kick pulse starting, with no lock involved', () => {
        const bump = new BassBump(GATE_BASS_BUMP);
        const out: BassSwell = { swell: 0, glow: 0 };
        const pulseStart = 600;
        let firstAbove = -1;
        let peak = 0;
        for (let frame = 0; frame < pulseStart + 90; frame++) {
            swellFromBump(bump.step(kickInput(frame, pulseStart), DT), out);
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
        // It settles back toward 0 after the pulse.
        expect(out.swell).toBeLessThan(0.05);
    });

    it('stays at 0 on steady bass and on silence', () => {
        const bump = new BassBump(GATE_BASS_BUMP);
        const out: BassSwell = { swell: 0, glow: 0 };
        for (let frame = 0; frame < 600; frame++) {
            swellFromBump(bump.step(frame < 300 ? 0.1 : 0, DT), out);
            if (frame > 240) {
                expect(out.swell).toBe(0);
            }
        }
    });
});

function bassFloor(): number {
    return 0.04;
}
