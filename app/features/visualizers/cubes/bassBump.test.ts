import { describe, expect, it } from 'vitest';
import { BassBump, BUMP_GAIN, BUMP_MARGIN, NEAR_SILENCE } from './bassBump';

// The rule BassPulse applied per frame, with the same constants, fed the same input.
function oldRule(inputs: number[]) {
    let fast = 0;
    let slow = 0;
    let pulse = 0;
    return inputs.map((energy) => {
        fast += (energy - fast) * (energy > fast ? 0.5 : 0.2);
        slow += (energy - slow) * 0.01;
        const ratio = slow > NEAR_SILENCE ? fast / slow : 1;
        const target = Math.min(1, Math.max(0, (ratio - BUMP_MARGIN) * BUMP_GAIN));
        pulse += (target - pulse) * (target > pulse ? 0.45 : 0.12);
        return { fast, slow, ratio, pulse };
    });
}

// A kick every half second on a steady bed: 0.3 between hits, 1 for the first 50 ms of each half second.
function drumInput(t: number): number {
    return t % 0.5 < 0.05 ? 1 : 0.3;
}

function run(fps: number, seconds: number, input: (t: number) => number): BassBump {
    const bump = new BassBump();
    const dt = 1 / fps;
    const frames = Math.round(seconds * fps);
    for (let i = 0; i < frames; i++) bump.step(input(i * dt), dt);
    return bump;
}

// Pulse `settle` seconds after a jump from a bed of 0.3 to `level`, at a frame rate.
function pulseAfterJump(fps: number, settle: number, level = 1): number {
    const bump = new BassBump();
    const dt = 1 / fps;
    for (let i = 0; i < fps * 2; i++) bump.step(0.3, dt);
    let pulse = 0;
    for (let i = 0; i < Math.round(settle * fps); i++) pulse = bump.step(level, dt);
    return pulse;
}

describe('BassBump', () => {
    it('matches the per-frame rule at 60 fps', () => {
        const dt = 1 / 60;
        const inputs = Array.from({ length: 300 }, (_, i) => drumInput(i * dt));
        const expected = oldRule(inputs);
        const bump = new BassBump();

        inputs.forEach((input, i) => {
            expect(bump.step(input, dt)).toBeCloseTo(expected[i].pulse, 9);
            expect(bump.fast).toBeCloseTo(expected[i].fast, 9);
            expect(bump.slow).toBeCloseTo(expected[i].slow, 9);
            expect(bump.ratio).toBeCloseTo(expected[i].ratio, 9);
        });
    });

    it('settles to the same followers at 30, 60 and 144 fps for a steady level', () => {
        const reference = run(60, 2, () => 0.6);

        for (const fps of [30, 144]) {
            const other = run(fps, 2, () => 0.6);
            expect(other.fast).toBeCloseTo(reference.fast, 6);
            expect(other.slow).toBeCloseTo(reference.slow, 6);
        }
    });

    it('answers a jump of level in the same time at 30, 60 and 144 fps, within 0.05 of the pulse', () => {
        for (const settle of [0.05, 0.1, 0.2, 0.4]) {
            const reference = pulseAfterJump(60, settle);
            expect(reference).toBeGreaterThan(0.1);
            expect(Math.abs(pulseAfterJump(30, settle) - reference)).toBeLessThan(0.05);
            expect(Math.abs(pulseAfterJump(144, settle) - reference)).toBeLessThan(0.05);
        }
    });

    it('settles back after a hit in the same time at 30, 60 and 144 fps, within 0.05 of the pulse', () => {
        const after = (fps: number) => {
            const bump = new BassBump();
            const dt = 1 / fps;
            for (let i = 0; i < fps * 2; i++) bump.step(0.3, dt);
            for (let i = 0; i < Math.round(0.2 * fps); i++) bump.step(1, dt);
            let pulse = 0;
            for (let i = 0; i < Math.round(0.3 * fps); i++) pulse = bump.step(0.3, dt);
            return pulse;
        };

        const reference = after(60);
        expect(Math.abs(after(30) - reference)).toBeLessThan(0.05);
        expect(Math.abs(after(144) - reference)).toBeLessThan(0.05);
    });

    it('bumps clearly on a kick over a bed', () => {
        const bump = new BassBump();
        let peak = 0;
        for (let i = 0; i < 360; i++) peak = Math.max(peak, bump.step(drumInput(i / 60), 1 / 60));

        expect(bump.slow).toBeGreaterThan(NEAR_SILENCE);
        expect(peak).toBeGreaterThan(0.6);
    });

    it('does not bump on a sustained level', () => {
        const sustained = run(60, 20, () => 0.8);

        expect(sustained.pulse).toBeCloseTo(0, 3);
        expect(sustained.ratio).toBeCloseTo(1, 2);
    });

    it('ignores near-silence', () => {
        const bump = run(60, 1, () => NEAR_SILENCE / 4);

        expect(bump.ratio).toBe(1);
        expect(bump.pulse).toBe(0);
    });

    it('clamps a stalled frame instead of jumping', () => {
        const bump = new BassBump();
        bump.step(1, 60);

        expect(bump.fast).toBeCloseTo(1 - 0.5 ** 6, 6);
    });

    it('treats a negative step as no time passing', () => {
        const bump = new BassBump();
        bump.step(1, -1);

        expect(bump.fast).toBe(0);
    });
});
