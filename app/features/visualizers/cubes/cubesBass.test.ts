import { describe, expect, it } from 'vitest';
import { BassBump, GATE_BASS_BUMP } from '~/features/audio/hub/bassBump';
import { createCubesBassEnvelope, stepCubesBass } from './cubesBass';

const DT = 1 / 60;

// A settled bass level, then a hit four times as loud: the gate-input bass as the hub would report it.
function hitLevels(): number[] {
    return [...Array<number>(60).fill(0.05), 0.2, 0.2, 0.2];
}

describe('stepCubesBass', () => {
    it('is BassPulse’s envelope over the gate-input bass, scaled by the strength', () => {
        const reference = new BassBump(GATE_BASS_BUMP);
        const envelope = createCubesBassEnvelope();
        let last = 0;
        for (const pulse of hitLevels()) {
            const expected = reference.step(pulse, DT) * 0.5;
            last = stepCubesBass(envelope, { pulse, lowEnd: 0 }, DT, { bassBump: true, bgPulse: 0.5 });
            expect(last).toBeCloseTo(expected, 12);
        }
        expect(last).toBeGreaterThan(0);
    });

    it('shows nothing with the switch off, but keeps following the bass so the next hit shows at once', () => {
        const off = createCubesBassEnvelope();
        const on = createCubesBassEnvelope();
        for (const pulse of hitLevels()) {
            expect(stepCubesBass(off, { pulse, lowEnd: 0 }, DT, { bassBump: false, bgPulse: 1 })).toBe(0);
            stepCubesBass(on, { pulse, lowEnd: 0 }, DT, { bassBump: true, bgPulse: 1 });
        }
        expect(off.pulse).toBe(on.pulse);
    });

    it('ignores the unscaled low end', () => {
        const a = createCubesBassEnvelope();
        const b = createCubesBassEnvelope();
        for (const pulse of hitLevels()) {
            const settings = { bassBump: true, bgPulse: 1 };
            expect(stepCubesBass(a, { pulse, lowEnd: 0 }, DT, settings)).toBe(
                stepCubesBass(b, { pulse, lowEnd: 5 }, DT, settings),
            );
        }
    });
});
