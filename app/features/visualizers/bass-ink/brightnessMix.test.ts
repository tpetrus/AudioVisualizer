import { describe, expect, it } from 'vitest';
import { createRhythmState } from '~/features/rhythm/types';
import { bassInkConfig } from './bassInkConfig';
import { bassInkSceneConfig } from './bassInkSceneConfig';
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
    it('keeps a slot for the drop when kicks and core steps crowd the window', () => {
        const mix = new BrightnessMix();
        const cue = cueWith({});
        let now = 0;
        const grants: number[] = [];
        const step = (kick: boolean) => {
            const before = mix.grantCount;
            mix.update(cue, kick, 1, now, DT, 1);
            for (let i = before; i < mix.grantCount; i++) {
                grants.push(now);
            }
            now += 0.05;
        };
        // Kicks and a core step land in the same second, then the drop.
        cue.tension = 0;
        step(true);
        cue.tension = 0.9;
        step(true);
        step(true);
        expect(mix.deniedCount).toBeGreaterThan(0);
        cue.dropAt = now;
        const before = mix.level;
        mix.update(cue, false, 0, now, 0, 1);
        expect(mix.level).toBeCloseTo(Math.max(before, config.dropBurst));
        expect(mix.level).toBeGreaterThanOrEqual(config.dropBurst);
        grants.push(now);
        for (const t of grants) {
            expect(grants.filter((g) => g >= t && g < t + 1).length).toBeLessThanOrEqual(3);
        }
    });

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
        // 0.5, 0.75 and 1 are all crossed at once: three requests, of which the shared cap of core steps and kick
        // flashes grants two, so a drop in the same second still finds a slot.
        expect(mix.grantCount).toBe(3);
        expect(mix.deniedCount).toBe(1);
        at(0);
        at(0.3);
        expect(mix.grantCount).toBe(4);
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
function runScene(bpm: number, intensity: number, withGlow = false) {
    const director = new SetDirector();
    const kicks = new KickRing();
    const mix = new BrightnessMix();
    const state = createRhythmState();
    const energy = { fast: 0.2, slow: 0.2, ratio: 1 };
    const period = 60 / bpm;
    const increaseTimes: number[] = [];
    // Every granted request (not only the visible increases), for the governor window.
    const grantTimes: number[] = [];
    let glowFrames = 0;
    const levels: number[] = [];
    // The bass gate pulses on every beat at full strength, as it does once a steady bassline is found.
    const gate = { bumpCount: 0, bumpTarget: 1, weight: 1 };
    let nextKick = 0;
    let onset = 0;
    let previousLevel = 0;
    let grantsSeen = 0;
    let dropped = false;
    const frames = 60 * 40;
    for (let i = 0; i < frames; i++) {
        const now = i * DT;
        onset *= Math.pow(0.9, 100 / 60);
        const kickNow = now >= nextKick - 1e-9;
        if (kickNow) {
            onset = 1;
            glowFrames = 8;
            gate.bumpCount++;
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
        const kickFired = kicks.update(gate, now);
        const cue = director.update(state, energy, now);
        const level = mix.update(
            cue,
            kickFired,
            kickFired ? kicks.strengths[(kicks.count - 1) % 8] : 0,
            now,
            DT,
            intensity,
        );
        let afterGlow = level;
        if (withGlow) {
            // Full gate pulses on every beat: the glow is 1 for a few frames after each kick, then 0.
            mix.requestBassGlow(glowFrames > 0 ? 1 : 0, now, intensity);
            glowFrames = Math.max(0, glowFrames - 1);
            afterGlow = mix.level;
        }
        for (let g = grantsSeen; g < mix.grantCount; g++) {
            grantTimes.push(now);
        }
        grantsSeen = mix.grantCount;
        if (afterGlow > previousLevel + 1e-9) {
            increaseTimes.push(now);
        }
        levels.push(afterGlow);
        previousLevel = afterGlow;
    }
    return { increaseTimes, grantTimes, levels, director, mix, kicks };
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

describe('Bass Ink brightness with the bass glow on every beat', () => {
    // The worst case: a 180 BPM kick train with kick flashes firing, the bass glow at 1 on every beat, and the drop and the
    // core steps of the scripted set. The swell adds no light (it is displacement only), so it needs no term here.
    it('never grants more than the governor limit in any one-second window', () => {
        const { grantTimes, mix, kicks, director } = runScene(180, 1, true);
        expect(kicks.count).toBeGreaterThan(100);
        expect(director.cue.dropAt).toBeGreaterThan(0);
        expect(grantTimes.length).toBeGreaterThan(10);
        // The glow really asked, and some requests were turned down.
        expect(mix.deniedCount).toBeGreaterThan(0);
        for (let i = 0; i + 3 < grantTimes.length; i++) {
            expect(grantTimes[i + 3] - grantTimes[i]).toBeGreaterThanOrEqual(1 - 1e-9);
        }
    });
});

describe('BrightnessMix.requestBassGlow', () => {
    const { glowArm, glowRearm, glowAmount } = bassInkSceneConfig.bass;

    it('grants once per upward crossing and re-arms below the lower threshold', () => {
        const mix = new BrightnessMix();
        mix.requestBassGlow(glowArm, 0, 1);
        expect(mix.grantCount).toBe(1);
        expect(mix.level).toBeCloseTo(glowAmount * glowArm, 9);
        // Wobbling between the two thresholds is the same pulse.
        mix.requestBassGlow(1, 3, 1);
        mix.requestBassGlow(glowRearm + 0.01, 3.1, 1);
        mix.requestBassGlow(glowArm, 3.2, 1);
        expect(mix.grantCount).toBe(1);
        // Below the lower threshold it re-arms, and the next crossing grants again.
        mix.requestBassGlow(glowRearm - 0.01, 3.3, 1);
        mix.requestBassGlow(1, 3.4, 1);
        expect(mix.grantCount).toBe(2);
        expect(mix.level).toBeCloseTo(glowAmount, 9);
    });

    it('grants nothing below the arm level', () => {
        const mix = new BrightnessMix();
        mix.requestBassGlow(glowArm - 0.01, 0, 1);
        expect(mix.grantCount).toBe(0);
        expect(mix.level).toBe(0);
    });

    it('grants nothing at intensity 0', () => {
        const mix = new BrightnessMix();
        mix.requestBassGlow(1, 0, 0);
        expect(mix.grantCount).toBe(0);
        expect(mix.level).toBe(0);
    });

    it('shares the soft cap with kick flashes', () => {
        const mix = new BrightnessMix();
        const cue = cueWith({});
        for (let i = 0; i < config.kickFlashMaxPerSecond; i++) {
            mix.update(cue, true, 1, i * 0.1, DT, 1);
        }
        const granted = mix.grantCount;
        mix.requestBassGlow(1, 0.5, 1);
        expect(mix.grantCount).toBe(granted);
        expect(mix.deniedCount).toBeGreaterThan(0);
        // A second after the first kick flash the cap has room again.
        mix.requestBassGlow(0, 1.05, 1);
        mix.requestBassGlow(1, 1.06, 1);
        expect(mix.grantCount).toBe(granted + 1);
    });
});
