import { describe, expect, it } from 'vitest';
import { createRhythmState } from '~/features/rhythm/types';
import { bassInkConfig } from './bassInkConfig';
import type { EnergyEnvelope } from './bassInkTypes';
import { FORMATION_COUNT } from './bassInkTypes';
import { SetDirector } from './setDirector';

const config = bassInkConfig.director;
// Most sequences start their build at once; the warm-up has its own spec below.
const noWarmup = { ...config, warmupSeconds: 0 };
// A loud build and the drop out of it, from the configured thresholds so the sequences follow tuning.
const BUILD_RATIO = config.buildEnterRatio + 0.1;
const DROP_RATIO = BUILD_RATIO + config.dropRise + 0.1;
const DT = 1 / 60;

// A scripted rig: set the inputs, run some seconds, read the cue.
class Rig {
    readonly director = new SetDirector(noWarmup);
    readonly state = createRhythmState();
    readonly energy = { fast: 0.2, slow: 0.2, ratio: 1 };
    now = 0;

    constructor() {
        this.groove();
    }

    // Steady music: kick present, energy flat.
    groove(): void {
        this.energy.ratio = 1;
        this.energy.fast = 0.2;
        this.state.bandOnsets[0] = 0.5;
        this.state.novelty = 0;
    }

    // A loud build with novelty to confirm it.
    build(): void {
        this.energy.ratio = BUILD_RATIO;
        this.state.bandOnsets[0] = 0.3;
        this.state.novelty = 0.8;
    }

    run(seconds: number): void {
        const frames = Math.round(seconds / DT);
        for (let i = 0; i < frames; i++) {
            this.step();
        }
    }

    step(): void {
        this.now += DT;
        this.director.update(this.state, this.energy as EnergyEnvelope, this.now);
    }

    drop(): void {
        this.energy.ratio = DROP_RATIO;
        this.state.bandOnsets[0] = 1;
        this.step();
        this.groove();
    }

    get cue() {
        return this.director.cue;
    }

    // Walks groove -> build.
    enterBuild(): void {
        this.run(1);
        this.build();
        this.run(config.buildEnterSeconds + 0.2);
    }
}

describe('SetDirector', () => {
    it('returns the same cue object every call', () => {
        const rig = new Rig();
        const first = rig.director.update(rig.state, rig.energy, 0);
        const second = rig.director.update(rig.state, rig.energy, 1);
        expect(first).toBe(second);
        expect(first).toBe(rig.director.cue);
    });

    it('starts in groove with two different formations and no transition', () => {
        const rig = new Rig();
        expect(rig.cue.phase).toBe('groove');
        expect(rig.cue.formationIndex).not.toBe(rig.cue.nextFormationIndex);
        expect(rig.cue.transitionCount).toBe(0);
        expect(rig.cue.transitionStart).toBe(-1);
        expect(rig.cue.dropAt).toBe(-1);
        expect(rig.cue.transitionSeconds).toBe(config.transitionSeconds);
        expect(rig.director.phaseCode).toBe(0);
    });

    it('stays in groove for steady music', () => {
        const rig = new Rig();
        rig.run(60);
        expect(rig.cue.phase).toBe('groove');
        expect(rig.cue.tension).toBe(0);
    });

    it('goes groove -> build -> drop -> afterglow -> groove (AC4)', () => {
        const rig = new Rig();
        rig.run(1);
        rig.build();
        rig.run(config.buildEnterSeconds - 0.5);
        expect(rig.cue.phase).toBe('groove');
        expect(rig.director.cueHeldSeconds).toBeGreaterThan(1);
        rig.run(0.7);
        expect(rig.cue.phase).toBe('build');
        expect(rig.director.phaseCode).toBe(1);

        // Tension rises during the build, within 0..1.
        rig.run(3);
        const t1 = rig.cue.tension;
        rig.run(3);
        expect(rig.cue.tension).toBeGreaterThan(t1);
        expect(rig.cue.tension).toBeLessThanOrEqual(1);
        expect(rig.cue.tension).toBeGreaterThan(0.3);

        const from = rig.cue.formationIndex;
        const to = rig.cue.nextFormationIndex;
        expect(to).not.toBe(from);
        rig.drop();
        expect(rig.cue.phase).toBe('drop');
        expect(rig.director.phaseCode).toBe(2);
        expect(rig.cue.dropAt).toBeCloseTo(rig.now, 6);
        expect(rig.cue.transitionCount).toBe(1);
        expect(rig.cue.transitionStart).toBeCloseTo(rig.now, 6);
        // During the transition the cue still shows the old formation and points to the new one.
        expect(rig.cue.formationIndex).toBe(from);
        expect(rig.cue.nextFormationIndex).toBe(to);

        // Tension falls away quickly after the drop.
        rig.run(config.tensionFallAfterDropSeconds + 0.1);
        expect(rig.cue.tension).toBe(0);

        rig.run(config.dropHoldSeconds);
        expect(rig.cue.phase).toBe('afterglow');
        expect(rig.director.phaseCode).toBe(3);

        // The transition has completed: the target is now the shown formation and a new target is picked.
        expect(rig.cue.formationIndex).toBe(to);
        expect(rig.cue.nextFormationIndex).not.toBe(to);

        // A loud cue during the afterglow does not start a build.
        rig.build();
        rig.run(2);
        expect(rig.cue.phase).toBe('afterglow');
        rig.groove();
        rig.run(config.afterglowSeconds);
        expect(rig.cue.phase).toBe('groove');
        expect(rig.cue.transitionCount).toBe(1);
    });

    it('needs the cue to hold twice as long when novelty does not confirm it', () => {
        const rig = new Rig();
        rig.build();
        rig.state.novelty = 0;
        rig.run(config.buildEnterSeconds + 0.5);
        expect(rig.cue.phase).toBe('groove');
        rig.run(config.buildEnterSeconds);
        expect(rig.cue.phase).toBe('build');
    });

    it('a broken cue starts over', () => {
        const rig = new Rig();
        rig.build();
        rig.run(1.5);
        rig.groove();
        rig.run(0.1);
        expect(rig.director.cueHeldSeconds).toBe(0);
        rig.build();
        rig.run(1.5);
        expect(rig.cue.phase).toBe('groove');
    });

    it('enters a build through the breakdown path (kick gone, sound present)', () => {
        const rig = new Rig();
        rig.energy.ratio = 0.8;
        rig.state.bandOnsets[0] = 0.02;
        rig.state.novelty = 0.9;
        rig.run(config.buildEnterSeconds + 0.2);
        expect(rig.cue.phase).toBe('build');
    });

    it('does not take silence for a breakdown', () => {
        const rig = new Rig();
        rig.energy.fast = 0;
        rig.energy.ratio = 1;
        rig.state.bandOnsets[0] = 0;
        rig.state.novelty = 1;
        rig.run(10);
        expect(rig.cue.phase).toBe('groove');
    });

    it('drops after a breakdown when the kick returns loudly', () => {
        const rig = new Rig();
        rig.energy.ratio = 0.8;
        rig.state.bandOnsets[0] = 0.02;
        rig.state.novelty = 0.9;
        rig.run(config.buildEnterSeconds + 0.2);
        rig.run(4);
        rig.drop();
        expect(rig.cue.phase).toBe('drop');
        expect(rig.cue.transitionCount).toBe(1);
    });

    it('does not drop on a loud ratio without a kick, or a kick without a loud ratio', () => {
        const rig = new Rig();
        rig.enterBuild();
        rig.energy.ratio = 1.8;
        rig.state.bandOnsets[0] = 0.3;
        rig.step();
        expect(rig.cue.phase).toBe('build');
        rig.energy.ratio = 1.2;
        rig.state.bandOnsets[0] = 1;
        rig.step();
        expect(rig.cue.phase).toBe('build');
    });

    it('abandons a build with no drop, without a transition, and eases the tension away slowly', () => {
        const rig = new Rig();
        rig.enterBuild();
        rig.run(config.buildMaxSeconds - 2);
        expect(rig.cue.phase).toBe('build');
        const peak = rig.cue.tension;
        expect(peak).toBe(1);
        rig.groove();
        rig.run(3);
        expect(rig.cue.phase).toBe('groove');
        expect(rig.cue.transitionCount).toBe(0);
        expect(rig.cue.tension).toBeLessThan(peak);
        // Slow: it is not gone after the fast time, but it is after the abandon time.
        rig.run(config.tensionFallAfterAbandonSeconds);
        expect(rig.cue.tension).toBe(0);
    });

    it('lets a song change alone start a transition after the coalesce window', () => {
        const rig = new Rig();
        rig.run(5);
        const to = rig.cue.nextFormationIndex;
        rig.state.songChangeCount++;
        rig.step();
        expect(rig.director.songChangePending).toBe(true);
        expect(rig.cue.transitionCount).toBe(0);
        rig.run(config.coalesceSeconds + 0.1);
        expect(rig.director.songChangePending).toBe(false);
        expect(rig.cue.transitionCount).toBe(1);
        expect(rig.cue.nextFormationIndex).toBe(to);
        rig.run(config.transitionSeconds + 0.1);
        expect(rig.cue.formationIndex).toBe(to);
    });

    it('only latches the song change count on the first update', () => {
        const rig = new Rig();
        const late = new SetDirector(noWarmup);
        rig.state.songChangeCount = 5;
        late.update(rig.state, rig.energy, 0);
        late.update(rig.state, rig.energy, 10);
        expect(late.cue.transitionCount).toBe(0);
        expect(late.songChangePending).toBe(false);
    });

    it('merges a drop that follows a song change into one transition (song change first)', () => {
        const rig = new Rig();
        rig.enterBuild();
        rig.run(2);
        rig.state.songChangeCount++;
        rig.run(1);
        expect(rig.director.songChangePending).toBe(true);
        rig.drop();
        expect(rig.cue.phase).toBe('drop');
        expect(rig.cue.transitionCount).toBe(1);
        expect(rig.director.songChangePending).toBe(false);
        rig.run(10);
        expect(rig.cue.transitionCount).toBe(1);
    });

    it('merges a song change that follows a drop into one transition (drop first)', () => {
        const rig = new Rig();
        rig.enterBuild();
        rig.drop();
        rig.run(1);
        rig.state.songChangeCount++;
        rig.run(config.coalesceSeconds + 1);
        expect(rig.cue.transitionCount).toBe(1);
        expect(rig.director.songChangePending).toBe(false);
    });

    it('plays the drop burst but starts no second transition for a drop right after a song-change transition', () => {
        const director = new SetDirector({ ...noWarmup, buildEnterSeconds: 0.2 });
        const state = createRhythmState();
        const energy = { fast: 0.2, slow: 0.2, ratio: 1 };
        let now = 0;
        const tick = (seconds: number) => {
            for (let i = 0; i < Math.round(seconds / DT); i++) {
                now += DT;
                director.update(state, energy, now);
            }
        };
        state.bandOnsets[0] = 0.5;
        tick(0.5);
        state.songChangeCount++;
        tick(config.coalesceSeconds + 0.1);
        expect(director.cue.transitionCount).toBe(1);
        const start = director.cue.transitionStart;
        // A build right after the song-change transition, dropping about a second later.
        energy.ratio = BUILD_RATIO;
        state.novelty = 1;
        tick(0.5);
        expect(director.cue.phase).toBe('build');
        energy.ratio = DROP_RATIO;
        state.bandOnsets[0] = 1;
        tick(DT * 2);
        expect(director.cue.phase).toBe('drop');
        expect(now - start).toBeLessThan(config.coalesceSeconds);
        expect(director.cue.dropAt).toBeGreaterThan(start);
        expect(director.cue.transitionCount).toBe(1);
    });

    it('a pending song change ends a build when its deadline arrives', () => {
        const rig = new Rig();
        rig.enterBuild();
        rig.state.songChangeCount++;
        rig.run(config.coalesceSeconds + 0.1);
        expect(rig.cue.phase).toBe('groove');
        expect(rig.cue.transitionCount).toBe(1);
    });

    it('ignores song changes that arrive right after a transition, and a second one while pending', () => {
        const rig = new Rig();
        rig.run(1);
        rig.state.songChangeCount++;
        rig.run(1);
        rig.state.songChangeCount++;
        rig.run(config.coalesceSeconds);
        expect(rig.cue.transitionCount).toBe(1);
        rig.run(1);
        rig.state.songChangeCount++;
        rig.run(config.coalesceSeconds + 1);
        expect(rig.cue.transitionCount).toBe(1);
        rig.run(10);
        rig.state.songChangeCount++;
        rig.run(config.coalesceSeconds + 0.1);
        expect(rig.cue.transitionCount).toBe(2);
    });

    it('restarts a transition mid-fade from the old target', () => {
        const director = new SetDirector({ ...noWarmup, coalesceSeconds: 0.05 });
        const state = createRhythmState();
        const energy = { fast: 0.2, slow: 0.2, ratio: 1 };
        director.update(state, energy, 0);
        state.songChangeCount++;
        director.update(state, energy, 0.1);
        director.update(state, energy, 0.2);
        expect(director.cue.transitionCount).toBe(1);
        const target = director.cue.nextFormationIndex;
        // 0.1 s later: outside the tiny coalesce window, so a new transition starts while the first is still fading.
        state.songChangeCount++;
        director.update(state, energy, 0.3);
        director.update(state, energy, 0.4);
        expect(director.cue.transitionCount).toBe(2);
        expect(director.cue.formationIndex).toBe(target);
        expect(director.cue.nextFormationIndex).not.toBe(target);
        expect(director.cue.nextFormationIndex).toBeLessThan(FORMATION_COUNT);
    });

    it('does not re-pick the target of a transition when a build starts during it', () => {
        const director = new SetDirector({ ...noWarmup, buildEnterSeconds: 0.5, coalesceSeconds: 0.1 });
        const state = createRhythmState();
        const energy = { fast: 0.2, slow: 0.2, ratio: 1 };
        state.bandOnsets[0] = 0.5;
        director.update(state, energy, 0);
        state.songChangeCount++;
        director.update(state, energy, 0.05);
        director.update(state, energy, 0.2);
        const target = director.cue.nextFormationIndex;
        expect(director.cue.transitionCount).toBe(1);
        energy.ratio = BUILD_RATIO;
        state.novelty = 1;
        for (let t = 0.25; t < 1.2; t += 0.05) {
            director.update(state, energy, t);
        }
        expect(director.cue.phase).toBe('build');
        expect(director.cue.nextFormationIndex).toBe(target);
    });

    it('latches the palette from the dominant pitch at the transition and keeps it when none is known', () => {
        const rig = new Rig();
        rig.run(1);
        rig.state.songChangeCount++;
        rig.run(config.coalesceSeconds + 0.1);
        // No chroma yet: palette index is kept (initial 0).
        expect(rig.cue.paletteIndex).toBe(0);
        rig.state.chroma[7] = 0.9;
        rig.run(1);
        // Changing chroma later does not move the latched palette.
        expect(rig.cue.paletteIndex).toBe(0);
        rig.run(10);
        rig.state.songChangeCount++;
        rig.run(config.coalesceSeconds + 0.1);
        expect(rig.cue.paletteIndex).toBe(7);
        rig.state.chroma[7] = 0;
        rig.state.chroma[2] = 0.9;
        rig.run(1);
        expect(rig.cue.paletteIndex).toBe(7);
    });

    it('picks formations deterministically and never the same one twice in a row', () => {
        const a = new SetDirector(noWarmup);
        const b = new SetDirector(noWarmup);
        expect(a.cue.nextFormationIndex).toBe(b.cue.nextFormationIndex);
        const state = createRhythmState();
        const energy = { fast: 0.2, slow: 0.2, ratio: 1 };
        let now = 0;
        const seen: number[] = [];
        for (let i = 0; i < 30; i++) {
            state.songChangeCount++;
            for (let t = 0; t < 6; t += 0.25) {
                now += 0.25;
                a.update(state, energy, now);
            }
            seen.push(a.cue.formationIndex);
        }
        expect(a.cue.transitionCount).toBeGreaterThan(10);
        for (let i = 1; i < seen.length; i++) {
            expect(seen[i]).not.toBe(seen[i - 1]);
        }
        expect(new Set(seen).size).toBeGreaterThan(2);
    });

    it('handles a time that does not advance', () => {
        const rig = new Rig();
        rig.director.update(rig.state, rig.energy, 5);
        rig.director.update(rig.state, rig.energy, 4);
        expect(rig.cue.phase).toBe('groove');
    });

    describe('reading the bass (tuned on local clips)', () => {
        // Feeds a scripted bass ratio at 60 fps with sound present and a kick on every frame (worst case for drops).
        function drive(director: SetDirector, ratioAt: (t: number) => number, seconds: number, kick = 0.8) {
            const state = createRhythmState();
            state.bandOnsets[0] = kick;
            const energy = { fast: 0.2, slow: 0.2, ratio: 1 };
            const drops: number[] = [];
            let seen = director.cue.dropAt;
            for (let f = 1; f <= Math.round(seconds / DT); f++) {
                const t = f * DT;
                energy.ratio = ratioAt(t);
                director.update(state, energy, t);
                if (director.cue.dropAt !== seen) {
                    seen = director.cue.dropAt;
                    drops.push(t);
                }
            }
            return drops;
        }

        it('reads no build or drop during the warm-up, however big the surge', () => {
            const director = new SetDirector();
            // A track fading in: the fast envelope runs far ahead of the slow one at first.
            expect(drive(director, (t) => (t < 1 ? 0.3 : 4), config.warmupSeconds - 0.1)).toEqual([]);
            expect(director.cue.phase).toBe('groove');
        });

        it('drops when the bass comes back after a cut of a bar or two', () => {
            const director = new SetDirector();
            // Steady, a 2 s cut at 10 s, the bass back at 12 s.
            const drops = drive(director, (t) => (t < 10 ? 1 : t < 12 ? 0.4 : 1.6), 16);
            expect(drops).toHaveLength(1);
            expect(drops[0]).toBeGreaterThanOrEqual(12);
            expect(drops[0]).toBeLessThan(12.1);
        });

        it('reads a soft cut held for softDipSeconds as a breakdown, and drops when the bass returns', () => {
            const director = new SetDirector();
            const cut = config.warmupSeconds + 2;
            const back = cut + config.softDipSeconds + 4;
            const soft = (config.dipRatio + config.softDipRatio) / 2;
            const drops = drive(
                director,
                (t) => (t < cut ? 1 : t < back ? soft : soft + config.dropRise + 0.1),
                back + 2,
            );
            expect(drops).toHaveLength(1);
            expect(drops[0]).toBeGreaterThanOrEqual(back);
            expect(drops[0]).toBeLessThan(back + 0.1);
        });

        it('does not take a soft cut shorter than softDipSeconds for a build', () => {
            const director = new SetDirector();
            const cut = config.warmupSeconds + 2;
            const soft = (config.dipRatio + config.softDipRatio) / 2;
            drive(director, (t) => (t > cut && t < cut + config.softDipSeconds * 0.5 ? soft : 1), cut + 4);
            expect(director.cue.phase).toBe('groove');
        });

        it('does not take a dip shorter than dipSeconds for a build', () => {
            const director = new SetDirector();
            const short = config.warmupSeconds + 2;
            drive(director, (t) => (t > short && t < short + config.dipSeconds * 0.5 ? 0.4 : 1), short + 2);
            expect(director.cue.phase).toBe('groove');
        });

        it('drops straight out of a quiet intro when the bass arrives at twice its level and stays', () => {
            const director = new SetDirector();
            const arrive = config.warmupSeconds + 2;
            const drops = drive(director, (t) => (t < arrive ? 1 : config.surgeRatio + 0.2), arrive + 3);
            expect(drops).toHaveLength(1);
            expect(drops[0]).toBeGreaterThanOrEqual(arrive + config.surgeSeconds);
            expect(drops[0]).toBeLessThan(arrive + config.surgeSeconds + 0.1);
        });

        it('does not count one loud hit shorter than surgeSeconds as a drop', () => {
            const director = new SetDirector();
            const hit = config.warmupSeconds + 2;
            const spike = (t: number) => (t > hit && t < hit + config.surgeSeconds * 0.6 ? config.surgeRatio + 1 : 1);
            expect(drive(director, spike, hit + 3)).toEqual([]);
        });

        it('does not drop a loud build on the frame it starts', () => {
            const director = new SetDirector(noWarmup);
            // A riser: the bass up with no kick (with a kick, a held rise is a surge drop instead). Above dropRatio,
            // but it never rises dropRise above where the build began.
            expect(drive(director, () => config.buildEnterRatio + 0.05, 8, 0.1)).toEqual([]);
            expect(director.cue.phase).toBe('build');
        });
    });
});
