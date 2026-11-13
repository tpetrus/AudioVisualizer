import { describe, expect, it } from 'vitest';
import { createRhythmState } from '~/features/rhythm/types';
import { bassInkConfig } from './bassInkConfig';
import type { DirectorCue } from './bassInkTypes';
import { BrightnessGovernor } from './brightnessGovernor';
import { BrightnessMix } from './brightnessMix';
import { KickRing } from './kickRing';
import { SetDirector } from './setDirector';

const DT = 1 / 60;
const config = bassInkConfig.brightness;

function cueWith(overrides: Partial<DirectorCue>): DirectorCue {
    return {
        phase: 'groove',
        tension: 0,
        dropAt: -1,
        formationIndex: 0,
        nextFormationIndex: 1,
        paletteIndex: 0,
        transitionStart: -1,
        transitionSeconds: 2,
        transitionCount: 0,
        ...overrides,
    };
}

describe('BrightnessMix', () => {
    it('flashes on a kick, scaled by strength, then decays toward 0', () => {
        const mix = new BrightnessMix();
        const cue = cueWith({});
        expect(mix.update(cue, true, 1, 0, DT, 1)).toBeCloseTo(config.kickFlash);
        expect(mix.grantCount).toBe(1);
        const later = mix.update(cue, false, 0, DT, DT, 1);
        expect(later).toBeLessThan(config.kickFlash);
        let level = later;
        for (let i = 2; i < 300; i++) {
            level = mix.update(cue, false, 0, i * DT, DT, 1);
        }
        expect(level).toBeLessThan(0.001);
        const weak = new BrightnessMix();
        expect(weak.update(cue, true, 0.5, 0, DT, 1)).toBeCloseTo(config.kickFlash * 0.5);
    });

    it('bursts once per new drop', () => {
        const mix = new BrightnessMix();
        const cue = cueWith({ dropAt: 5 });
        expect(mix.update(cue, false, 0, 5, DT, 1)).toBeCloseTo(config.dropBurst);
        expect(mix.grantCount).toBe(1);
        mix.update(cue, false, 0, 5.1, DT, 1);
        expect(mix.grantCount).toBe(1);
        cue.dropAt = 9;
        mix.update(cue, false, 0, 9, DT, 1);
        expect(mix.grantCount).toBe(2);
    });

    it('requests a core step once per upward crossing and again after coming back down', () => {
        const mix = new BrightnessMix();
        const cue = cueWith({});
        let now = 0;
        const at = (tension: number) => {
            now += 1.2;
            cue.tension = tension;
            mix.update(cue, false, 0, now, DT, 1);
        };
        at(0.1);
        expect(mix.grantCount).toBe(0);
        at(0.3);
        expect(mix.grantCount).toBe(1);
        at(0.4);
        expect(mix.grantCount).toBe(1);
        at(1);
        // 0.5, 0.75 and 1 are all crossed at once: three more requests.
        expect(mix.grantCount).toBe(4);
        at(0);
        at(0.3);
        expect(mix.grantCount).toBe(5);
    });

    it('keeps one governor slot free from kick trains for a drop', () => {
        const mix = new BrightnessMix();
        const cue = cueWith({});
        let granted = 0;
        // A kick every 0.1 s for 3 s, but at most 2 flashes per second may pass.
        for (let i = 0; i < 30; i++) {
            const before = mix.grantCount;
            mix.update(cue, true, 1, i * 0.1, 0.1, 1);
            granted += mix.grantCount - before;
        }
        expect(granted).toBeLessThanOrEqual(6);
        cue.dropAt = 2.95;
        const before = mix.grantCount;
        mix.update(cue, false, 0, 2.95, DT, 1);
        expect(mix.grantCount).toBe(before + 1);
    });

    it('scales every term by intensity and stays flat at 0', () => {
        const half = new BrightnessMix();
        const zero = new BrightnessMix();
        const cue = cueWith({ dropAt: 1 });
        expect(half.update(cue, false, 0, 1, DT, 0.5)).toBeCloseTo(config.dropBurst * 0.5);
        for (let i = 0; i < 100; i++) {
            expect(zero.update(cueWith({ dropAt: i + 1, tension: (i % 5) / 4 }), true, 1, i * 0.3, DT, 0)).toBe(0);
        }
        expect(zero.grantCount).toBe(0);
    });

    it('treats a negative frame delta as no decay', () => {
        const mix = new BrightnessMix(config, new BrightnessGovernor(1));
        const cue = cueWith({});
        mix.update(cue, true, 1, 0, DT, 1);
        expect(mix.update(cue, false, 0, 0.1, -1, 1)).toBeCloseTo(config.kickFlash);
    });
});

// AC5: the real director, kick ring and mix together, over a whole groove -> build -> drop -> afterglow.
function runScene(bpm: number, intensity: number) {
    const director = new SetDirector();
    const kicks = new KickRing();
    const mix = new BrightnessMix();
    const state = createRhythmState();
    const energy = { fast: 0.2, slow: 0.2, ratio: 1 };
    const period = 60 / bpm;
    const increaseTimes: number[] = [];
    const levels: number[] = [];
    let nextKick = 0;
    let onset = 0;
    let previousLevel = 0;
    let dropped = false;
    const frames = 60 * 40;
    for (let i = 0; i < frames; i++) {
        const now = i * DT;
        onset *= Math.pow(0.9, 100 / 60);
        const kickNow = now >= nextKick - 1e-9;
        if (kickNow) {
            onset = 1;
            nextKick += period;
        }
        state.bandOnsets[0] = onset;
        // 0-8 s groove, 8-18 s with the bass cut (the build), the bass back at 18 s (the drop at the first kick),
        // then afterglow and groove again.
        const building = now >= 8 && now < 18;
        energy.ratio = building ? 0.5 : 1;
        if (now >= 18 && !dropped) {
            energy.ratio = 1.6;
            if (director.cue.dropAt >= 0) {
                dropped = true;
            }
        }
        state.novelty = building ? 0.9 : 0;
        const kickFired = kicks.update(onset, now);
        const cue = director.update(state, energy, now);
        const level = mix.update(
            cue,
            kickFired,
            kickFired ? kicks.strengths[(kicks.count - 1) % 8] : 0,
            now,
            DT,
            intensity,
        );
        if (level > previousLevel + 1e-9) {
            increaseTimes.push(now);
        }
        levels.push(level);
        previousLevel = level;
    }
    return { increaseTimes, levels, director, mix, kicks };
}

describe('Bass Ink brightness through the whole scene (AC5)', () => {
    it.each([128, 174, 200])('never lights up more than 3 times in any second at %i BPM', (bpm) => {
        const { increaseTimes, director, mix, kicks } = runScene(bpm, 1);
        // The scripted set really went through the drop, and the flashes really happened.
        expect(director.cue.dropAt).toBeGreaterThan(0);
        expect(director.cue.transitionCount).toBeGreaterThanOrEqual(1);
        expect(kicks.count).toBeGreaterThan(40);
        expect(increaseTimes.length).toBeGreaterThan(10);
        expect(mix.grantCount).toBeGreaterThanOrEqual(increaseTimes.length);
        for (let i = 0; i + 3 < increaseTimes.length; i++) {
            expect(increaseTimes[i + 3] - increaseTimes[i]).toBeGreaterThanOrEqual(1);
        }
    });

    it('plays the drop burst at full level even under a 200 BPM kick train', () => {
        const { levels, director } = runScene(200, 1);
        const dropFrame = Math.round(director.cue.dropAt / DT);
        expect(levels[dropFrame]).toBeCloseTo(bassInkConfig.brightness.dropBurst, 5);
    });

    it('halves the peaks at intensity 0.5 and is flat at 0', () => {
        const full = runScene(128, 1);
        const half = runScene(128, 0.5);
        const none = runScene(128, 0);
        expect(Math.max(...half.levels)).toBeCloseTo(Math.max(...full.levels) / 2, 5);
        expect(Math.max(...none.levels)).toBe(0);
        expect(none.mix.grantCount).toBe(0);
    });
});
