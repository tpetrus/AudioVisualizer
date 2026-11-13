// Every tunable of the Bass Ink visualizer in one place, so tuning never means hunting through modules. All times are
// scene-clock seconds. The values are starting points chosen from the design; tuning happens against real tracks.

export const bassInkConfig = {
    energy: {
        // Fast follower: long enough to ignore a single kick, short enough to notice a build within a bar or two.
        fastTauSeconds: 0.4,
        // Slow follower: the "recent past" the fast one is compared with, a few bars of music.
        slowTauSeconds: 8,
        // Below this RMS the slow envelope is treated as silence, so a quiet gap does not turn into a huge ratio.
        silenceFloor: 0.005,
        // The envelopes follow the bass below this frequency: a DJ builds tension by pulling the bass out and drops by
        // bringing it back, which shows far more clearly in the bass than in the full-band loudness. Same cutoff as
        // the debug harness's bassRaw column, so recordings can be replayed against these rules.
        bassCutoffHz: 120,
    },
    motion: {
        // Lock only when the tempo is trusted, and release at a lower value so the lock does not chatter.
        enterConfidence: 0.6,
        exitConfidence: 0.4,
        // Blending between free and locked motion takes this long, so a lock change never looks like a cut.
        weightEaseSeconds: 1.5,
        // One breath every 4 s when no tempo is known.
        freeBreathingSeconds: 4,
        // How strongly a locked clock is pulled toward the real bar position (per second, times the phase error).
        correctionRate: 1.5,
        // The pull never changes the phase step by more than this fraction of the base step, so it cannot stall or jump.
        maxCorrectionFraction: 0.5,
    },
    chroma: {
        // Pitch classes drift between notes; 3 s of smoothing keeps the palette from following single notes.
        smoothingTauSeconds: 3,
        // A challenger must beat the current class by this much (chroma is 0..1) ...
        hysteresisMargin: 0.08,
        // ... continuously for this long before the palette's pitch class changes.
        dwellSeconds: 4,
        // Below this smoothed strength there is no tonal content to follow (noise, silence).
        minEnergy: 0.05,
        // Palette look: saturated bright core, darker edge shifted along the hue circle.
        coreSaturation: 0.85,
        coreLightness: 0.6,
        edgeSaturation: 0.7,
        edgeLightness: 0.3,
        edgeHueShiftDegrees: 40,
    },
    director: {
        // Bass at 1.6x its recent level, held, reads as a build. Set high because the bass staying up after a drop
        // also runs above its recent level for a while, and that is not a build. With a kick on top the same rise is
        // a surge drop (surgeRatio below), so in practice this path is the kickless riser.
        buildEnterRatio: 1.6,
        // The cue must hold this long without a break, so a loud bar or one missing kick is not a build.
        buildEnterSeconds: 2,
        // Novelty only confirms a build early; without it the cue must hold twice as long.
        noveltyConfirm: 0.5,
        // Kick onset below this (while there is sound) means a breakdown or riser.
        kickAbsentLevel: 0.15,
        // The energy fed in is the bass. Bass this far below its recent level means the DJ pulled it out (a breakdown
        // or the classic one-bar cut before a drop); held this long it is a build on its own, without novelty, because
        // novelty needs half a minute of history and lags the cut by seconds.
        dipRatio: 0.7,
        dipSeconds: 1,
        // A softer cut, held longer, is a breakdown where the DJ only thins the bass out for a phrase.
        softDipRatio: 0.85,
        softDipSeconds: 3,
        // No build or drop is read until there has been sound for this long: the slow envelope needs time to learn
        // the level, and a track fading in would otherwise look like a huge surge.
        warmupSeconds: 6,
        // A drop out of a quiet intro has no cut before it: the bass simply arrives at twice its level or more and
        // stays. Held this long it is a drop on its own, which also keeps one loud hit from counting.
        surgeRatio: 1.6,
        surgeSeconds: 1,
        // Energy floor for the breakdown cue, in line with the energy tracker's silence floor.
        silenceFloor: 0.005,
        // Tension climbs from 0 to 1 over this time during a build.
        buildRampSeconds: 12,
        // Extra tension per unit of ratio above 1, so louder builds tighten faster.
        buildRatioPush: 0.15,
        // A build with no drop for this long is given up.
        buildMaxSeconds: 40,
        // The drop needs the bass back well above its recent level and a real kick on the same frame. Tuned on the
        // local reference clips: after a cut the bass is back above its recent level within a few frames of the drop.
        dropRatio: 1.05,
        dropKickLevel: 0.4,
        // The drop must also rise this far above the lowest ratio of its build, so a loud build (already above
        // dropRatio) does not drop on the frame it starts, while the bass coming back after a cut easily does.
        dropRise: 0.4,
        // How long the drop phase lasts before the afterglow settles things.
        dropHoldSeconds: 1.5,
        // No new build can start during the afterglow, so one drop is not followed by an instant re-build.
        afterglowSeconds: 6,
        // Tension falls fast after a drop and slowly after an abandoned build.
        tensionFallAfterDropSeconds: 1,
        tensionFallAfterAbandonSeconds: 3,
        // Fixed length so a transition looks the same in every genre.
        transitionSeconds: 2,
        // A song change and a drop this close together are one event and share one transition.
        coalesceSeconds: 3,
        // Seed of the deterministic formation choice, so a given set of events always picks the same shapes.
        formationSeed: 7,
    },
    brightness: {
        // Peak of a kick flash at full strength; small so a kick train never washes the screen out.
        kickFlash: 0.35,
        // A drop is the one big flash.
        dropBurst: 1,
        // Tension levels that each give the core one brighter step on the way up a build.
        coreStepTension: [0.25, 0.5, 0.75, 1] as readonly number[],
        // At most this many kick flashes per second, so a fast kick train always leaves one of the governor's three
        // slots free for a drop burst or a core step.
        kickFlashMaxPerSecond: 2,
        // Size of one core step; small, since up to four of them happen over a whole build.
        coreStepGain: 0.3,
        // How fast the level falls back to 0 after a flash.
        decayTauSeconds: 0.35,
    },
    formations: {
        // Inner radius of the thick sphere shell (the outer one is 1).
        sphereInnerRadius: 0.7,
        // Torus: ring radius and tube radius, so the whole shape stays inside radius 1.
        torusMajorRadius: 0.7,
        torusMinorRadius: 0.3,
        // Double helix: strand radius, number of turns and half height.
        helixRadius: 0.45,
        helixTurns: 3,
        helixHalfHeight: 0.95,
        // Disc galaxy: spiral arms, how much each arm winds, and the thickness of the flat disc.
        discArms: 2,
        discTwist: 3,
        discThickness: 0.06,
        // Share of disc points in the arms (the rest are spread over the whole disc) and each arm's angular width.
        discArmShare: 0.7,
        discArmSpread: 1.6,
    },
};

export type EnergyConfig = typeof bassInkConfig.energy;
export type MotionConfig = typeof bassInkConfig.motion;
export type ChromaConfig = typeof bassInkConfig.chroma;
export type DirectorConfig = typeof bassInkConfig.director;
export type BrightnessConfig = typeof bassInkConfig.brightness;
export type FormationsConfig = typeof bassInkConfig.formations;
