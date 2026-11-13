import type { RhythmState } from '~/features/rhythm/types';
import { bassInkConfig, type DirectorConfig } from './bassInkConfig';
import { FORMATION_COUNT, type DirectorCue, type EnergyEnvelope } from './bassInkTypes';
import { DominantPitch } from './chromaPalette';
import { hash01 } from './formations';

const PHASE_CODES = { groove: 0, build: 1, drop: 2, afterglow: 3 } as const;

// Reads the music's energy and rhythm state and decides where in a DJ-style set the visual is: groove, a build that
// tightens the cloud, a drop that releases it, the afterglow, and when to move to a new formation. It returns one
// reused cue object; the scene only reads it (plan C1).
export class SetDirector {
    readonly cue: DirectorCue = {
        phase: 'groove',
        tension: 0,
        dropAt: -1,
        formationIndex: 0,
        nextFormationIndex: 1,
        paletteIndex: 0,
        transitionStart: -1,
        transitionSeconds: 0,
        transitionCount: 0,
    };
    private readonly config: DirectorConfig;
    private readonly pitch: DominantPitch;
    private started = false;
    private lastNow = 0;
    private phaseStart = 0;
    private buildStart = 0;
    // Scene time the energy cue (loud, or kick gone) started holding without a break, or -1 while it does not hold.
    private cueHeldSince = -1;
    private tensionFallSeconds: number;
    private transitioning = false;
    private pickCount = 0;
    private songChangeSeen = 0;
    private songChangeLatched = false;
    // Deadline of a song change waiting for a drop to share its transition, or -1.
    private pendingDeadline = -1;
    // Scene time sound was first heard, or -1 before; builds and drops wait for the warm-up after it.
    private soundSince = -1;
    // Scene time the bass dip started holding without a break, or -1 while it does not hold.
    private dipSince = -1;
    // Same for the softer, longer cut.
    private softDipSince = -1;
    // Lowest energy ratio seen in the current build; the drop is measured from it.
    private buildMinRatio = Infinity;
    // Scene time the bass surge started holding without a break, or -1 while it does not hold.
    private surgeSince = -1;

    constructor(config: DirectorConfig = bassInkConfig.director) {
        this.config = config;
        this.pitch = new DominantPitch();
        this.tensionFallSeconds = config.tensionFallAfterDropSeconds;
        this.cue.transitionSeconds = config.transitionSeconds;
        this.cue.nextFormationIndex = this.pick(this.cue.formationIndex);
    }

    // 0 groove, 1 build, 2 drop, 3 afterglow: a number for telemetry columns.
    get phaseCode(): number {
        return PHASE_CODES[this.cue.phase];
    }

    // True while a song change waits for a drop to share its transition.
    get songChangePending(): boolean {
        return this.pendingDeadline >= 0;
    }

    // Seconds the energy cue has held without a break (0 when it does not hold).
    get cueHeldSeconds(): number {
        return this.cueHeldSince < 0 ? 0 : this.lastNow - this.cueHeldSince;
    }

    update(state: RhythmState, energy: EnergyEnvelope, nowSeconds: number): DirectorCue {
        const config = this.config;
        const cue = this.cue;
        const dt = this.started ? Math.max(0, nowSeconds - this.lastNow) : 0;
        this.started = true;
        this.lastNow = nowSeconds;

        this.pitch.update(state.chroma, dt);

        if (this.transitioning && nowSeconds >= cue.transitionStart + cue.transitionSeconds) {
            this.transitioning = false;
            cue.formationIndex = cue.nextFormationIndex;
            cue.nextFormationIndex = this.pick(cue.formationIndex);
        }

        this.trackSongChange(state.songChangeCount, nowSeconds);
        if (this.pendingDeadline >= 0 && nowSeconds >= this.pendingDeadline) {
            // No drop came to share it, so the song change gets its own transition. A new song also ends a build:
            // the tension belonged to the old one.
            this.pendingDeadline = -1;
            if (cue.phase === 'build') {
                this.abandonBuild(nowSeconds);
            }
            this.startTransition(nowSeconds);
        }

        switch (cue.phase) {
            case 'groove':
                this.updateGroove(state, energy, nowSeconds);
                break;
            case 'build':
                this.updateBuild(state, energy, nowSeconds);
                break;
            case 'drop':
                if (nowSeconds - this.phaseStart >= config.dropHoldSeconds) {
                    this.setPhase('afterglow', nowSeconds);
                }
                break;
            case 'afterglow':
                if (nowSeconds - this.phaseStart >= config.afterglowSeconds) {
                    this.setPhase('groove', nowSeconds);
                    this.cueHeldSince = -1;
                }
                break;
        }

        if (cue.phase !== 'build') {
            cue.tension = Math.max(0, cue.tension - dt / this.tensionFallSeconds);
        }
        return cue;
    }

    private updateGroove(state: RhythmState, energy: EnergyEnvelope, now: number): void {
        const config = this.config;
        const sounding = energy.fast > config.silenceFloor;
        if (sounding && this.soundSince < 0) {
            this.soundSince = now;
        }
        if (this.soundSince < 0 || now - this.soundSince < config.warmupSeconds) {
            this.cueHeldSince = -1;
            this.dipSince = -1;
            this.softDipSince = -1;
            this.surgeSince = -1;
            return;
        }

        // The bass arriving out of a quiet intro is a drop with no build before it.
        if (energy.ratio >= config.surgeRatio) {
            if (this.surgeSince < 0) {
                this.surgeSince = now;
            }
            if (now - this.surgeSince >= config.surgeSeconds && state.bandOnsets[0] >= config.dropKickLevel) {
                this.surgeSince = -1;
                this.cueHeldSince = -1;
                this.dipSince = -1;
                this.softDipSince = -1;
                this.drop(now);
                return;
            }
        } else {
            this.surgeSince = -1;
        }

        // A bass cut is the strongest sign of a coming drop, so it enters the build on its own.
        if (sounding && energy.ratio <= config.dipRatio) {
            if (this.dipSince < 0) {
                this.dipSince = now;
            }
            if (now - this.dipSince >= config.dipSeconds) {
                this.enterBuild(now);
                return;
            }
        } else {
            this.dipSince = -1;
        }
        // A soft cut needs to hold longer, so a quieter bar or a filter sweep in a groove is not read as a breakdown.
        if (sounding && energy.ratio <= config.softDipRatio) {
            if (this.softDipSince < 0) {
                this.softDipSince = now;
            }
            if (now - this.softDipSince >= config.softDipSeconds) {
                this.enterBuild(now);
                return;
            }
        } else {
            this.softDipSince = -1;
        }

        const loud = energy.ratio >= config.buildEnterRatio;
        const kickGone = state.bandOnsets[0] < config.kickAbsentLevel && energy.fast > config.silenceFloor;
        if (!loud && !kickGone) {
            this.cueHeldSince = -1;
            return;
        }
        if (this.cueHeldSince < 0) {
            this.cueHeldSince = now;
        }
        const held = now - this.cueHeldSince;
        // Novelty only confirms: without it the same cue has to hold twice as long.
        if (
            held >= config.buildEnterSeconds &&
            (state.novelty >= config.noveltyConfirm || held >= 2 * config.buildEnterSeconds)
        ) {
            this.enterBuild(now);
        }
    }

    private enterBuild(now: number): void {
        this.setPhase('build', now);
        this.buildStart = now;
        this.buildMinRatio = Infinity;
        this.cueHeldSince = -1;
        this.dipSince = -1;
        this.softDipSince = -1;
        if (!this.transitioning) {
            this.cue.nextFormationIndex = this.pick(this.cue.formationIndex);
        }
    }

    private updateBuild(state: RhythmState, energy: EnergyEnvelope, now: number): void {
        const config = this.config;
        const cue = this.cue;
        const elapsed = now - this.buildStart;
        const target = elapsed / config.buildRampSeconds + Math.max(0, energy.ratio - 1) * config.buildRatioPush;
        // Tension never falls inside a build, so each core step is reached once.
        cue.tension = Math.max(cue.tension, Math.min(1, Math.max(0, target)));

        this.buildMinRatio = Math.min(this.buildMinRatio, energy.ratio);
        if (
            energy.ratio >= config.dropRatio &&
            energy.ratio - this.buildMinRatio >= config.dropRise &&
            state.bandOnsets[0] >= config.dropKickLevel
        ) {
            this.drop(now);
        } else if (elapsed >= config.buildMaxSeconds) {
            this.abandonBuild(now);
        }
    }

    private drop(now: number): void {
        const config = this.config;
        const cue = this.cue;
        cue.dropAt = now;
        this.setPhase('drop', now);
        this.tensionFallSeconds = config.tensionFallAfterDropSeconds;
        // A transition that started moments ago (a song change) already covers this drop: the burst still plays, but
        // a second formation change right behind the first would only look like a stutter.
        const recent = cue.transitionStart >= 0 && now - cue.transitionStart < config.coalesceSeconds;
        this.pendingDeadline = -1;
        if (!recent) {
            this.startTransition(now);
        }
    }

    private abandonBuild(now: number): void {
        this.setPhase('groove', now);
        this.tensionFallSeconds = this.config.tensionFallAfterAbandonSeconds;
        this.cueHeldSince = -1;
    }

    private setPhase(phase: DirectorCue['phase'], now: number): void {
        this.cue.phase = phase;
        this.phaseStart = now;
    }

    private trackSongChange(count: number, now: number): void {
        if (!this.songChangeLatched) {
            this.songChangeLatched = true;
            this.songChangeSeen = count;
            return;
        }
        if (count === this.songChangeSeen) {
            return;
        }
        this.songChangeSeen = count;
        const cue = this.cue;
        const merged = cue.transitionStart >= 0 && now - cue.transitionStart < this.config.coalesceSeconds;
        if (!merged && this.pendingDeadline < 0) {
            this.pendingDeadline = now + this.config.coalesceSeconds;
        }
    }

    private startTransition(now: number): void {
        const cue = this.cue;
        if (this.transitioning) {
            // Restarted mid-fade: fade from where the old one was heading. The cloud copies its current blend, so this
            // does not jump.
            cue.formationIndex = cue.nextFormationIndex;
            cue.nextFormationIndex = this.pick(cue.formationIndex);
        }
        this.transitioning = true;
        cue.transitionStart = now;
        cue.transitionCount++;
        if (this.pitch.pitchClass >= 0) {
            cue.paletteIndex = this.pitch.pitchClass;
        }
    }

    // Deterministic pick of a formation other than `exclude`.
    private pick(exclude: number): number {
        const r = Math.floor(hash01(this.pickCount++, this.config.formationSeed, 11) * (FORMATION_COUNT - 1));
        return r >= exclude ? r + 1 : r;
    }
}
