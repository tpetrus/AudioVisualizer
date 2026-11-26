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
    it('passes the bump straight through, with glow equal to swell', () => {
        const out: BassSwell = { swell: 0, glow: 0 };
        for (const bump of [0, 0.1, 0.37, 0.5, 0.99, 1]) {
            swellFromBump(bump, out);
            expect(out).toEqual({ swell: bump, glow: bump });
        }
    });

    it('clamps to 0..1', () => {
        const out: BassSwell = { swell: 0.5, glow: 0.5 };
        swellFromBump(-1, out);
        expect(out).toEqual({ swell: 0, glow: 0 });
        swellFromBump(5, out);
        expect(out).toEqual({ swell: 1, glow: 1 });
    });

    it('reads NaN and infinities as 0', () => {
        const out: BassSwell = { swell: 1, glow: 1 };
        for (const bad of [Number.NaN, Number.NEGATIVE_INFINITY, Number.POSITIVE_INFINITY]) {
            out.swell = 1;
            out.glow = 1;
            swellFromBump(bad, out);
            expect(out).toEqual({ swell: 0, glow: 0 });
        }
    });

    it('swells above 0.3 within 3 frames of a kick pulse starting, with no lock involved', () => {
        const bump = new BassBump(GATE_BASS_BUMP);
        const out: BassSwell = { swell: 0, glow: 0 };
        const pulseStart = 600;
        let firstAbove = -1;
        for (let frame = 0; frame < pulseStart + 90; frame++) {
            const value = bump.step(kickInput(frame, pulseStart), DT);
            swellFromBump(value, out);
            // It is the bump itself at every frame.
            expect(out.swell).toBe(Math.min(1, Math.max(0, value)));
            expect(out.glow).toBe(out.swell);
            if (frame >= pulseStart && out.swell > 0.3 && firstAbove < 0) {
                firstAbove = frame - pulseStart;
            }
        }
        // Frame 0 is the first frame of the pulse, so "within 3 frames" is index 0, 1 or 2.
        expect(firstAbove).toBeGreaterThanOrEqual(0);
        expect(firstAbove).toBeLessThanOrEqual(2);
    });
});
