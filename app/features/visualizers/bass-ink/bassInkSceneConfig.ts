// Tunables of the Bass Ink scene (the cloud, its shaders and the camera), kept apart from bassInkConfig, which holds the
// set-logic tunables. Distances are world units; the unit formations have radius about 1 and are scaled by `radius`.

export const bassInkSceneConfig = {
    points: {
        // Enough points for a dense, smoky cloud on a real GPU; the density control scales it.
        basePointCount: 100000,
        // 0.8 of the base is the default: dense yet comfortably within a mid-range GPU's point budget.
        defaultDensity: 0.8,
        // Software WebGL (SwiftShader in CI and e2e) is CPU-bound, so it gets a small cloud that still renders.
        softwarePointCap: 8000,
        // Safe point-size limit when the GPU does not report one (every WebGL implementation supports at least 1; most
        // support far more).
        fallbackMaxPointSize: 64,
        // Writing a formation is cheap but not free: 20000 points per update keeps a frame's share to a few ms, so a
        // whole 100000-point formation is ready within five frames, long before a transition needs it.
        fillChunkPoints: 20000,
    },
    cloud: {
        // World radius of the unit formations.
        radius: 3.4,
        // At full tension the cloud has shrunk by this fraction: the build visibly gathers itself.
        tensionSqueeze: 0.35,
        // Breathing swells the cloud by this fraction either way, one cycle per breathing phase.
        breathingAmplitude: 0.07,
        // Every beat of a locked tempo punches the cloud out by up to this fraction, times the bass presence, so the
        // cloud keeps the tempo even before the bass gate has found the kick. A 9 percent swell moves points apart
        // without adding light (the point count and sizes stay the same).
        beatPunch: 0.09,
        // The cloud is tipped toward the camera by this angle (radians). Seen exactly from the side, the flat disc and the
        // ring-shaped formations collapse into a bright line.
        tilt: 0.5,
    },
    wave: {
        // Kick shockwave: world units per second the front travels, so it crosses the cloud in about a second.
        speed: 7,
        // Thickness (gaussian width) of the front.
        width: 0.7,
        // Seconds for a wave's strength to fall by a factor of e; the front fades before it leaves the cloud.
        decay: 0.7,
        // Outward push of a full-strength kick at the front, in world units.
        amplitude: 0.9,
        // The sum of overlapping waves is limited so a kick train never tears the cloud apart.
        maxDisplacement: 1.3,
    },
    spectrum: {
        // 48 log-spaced frequencies from the sub-bass to the air band: enough for distinct waves, few enough to blur.
        columns: 48,
        lowHz: 35,
        highHz: 12000,
        // About 0.8 s of history at 60 fps, so a wave takes that long to roll from the rim to the center.
        rows: 48,
        // Gaussian blur across neighboring frequencies (in columns), so a single bin becomes a rounded hill.
        blurSigma: 1.2,
        // Each frequency is measured between its running average (over this many seconds) and its recent peak, so the
        // highs move as much as the bass and every band shows its own rhythm. The peak falls about 15 percent a second.
        meanSeconds: 1.5,
        peakDecay: 0.997,
        // A frequency below this byte level (near the analyser's floor) never moves, so silence stays flat ...
        peakFloor: 40,
        // ... and a frequency that barely varies is not blown up into big jumps by a tiny peak-to-average range.
        minRange: 25,
        // Levels this little above a frequency's average do not move, so the steady part of a sound stays still and
        // only what changes makes a wave.
        knee: 0.1,
        // A frequency rises within a frame or two of getting louder and falls back more slowly, like the trio bars.
        attackSeconds: 0.03,
        releaseSeconds: 0.22,
        // World units a point on the rim moves outward at full level (less toward the center), so the outline becomes
        // the spectrum without leaving the view.
        amplitude: 1.1,
    },
    turbulence: {
        // Spatial frequency of the swirling displacement (smaller means broader swirls).
        scale: 0.55,
        // Always-on drift so the cloud never looks frozen, plus a share that follows the mid band.
        base: 0.06,
        midGain: 0.3,
        // The mid band is followed with these time constants (seconds), so the swirl grows over a busy passage and
        // settles in a quiet one rather than jumping on each snare or clap.
        midAttackSeconds: 0.3,
        midReleaseSeconds: 1.2,
        // How fast the swirl evolves, per second.
        speed: 0.6,
        // At full tension the points shiver by this much (world units): the build trembles before the drop.
        tensionJitter: 0.08,
    },
    sparkle: {
        // Share of points that can sparkle; the rest never do, so the highs read as glints, not a global flash.
        fraction: 0.06,
        // A sparkling point grows by up to this factor times the high-band onset. Points are additive, so a bigger point
        // adds light: with this share and amplitude the whole cloud gains at most about 8% on a full hat, under the 10%
        // a flash has to change by to count (WCAG 2.3.1), however fast the hats are. The scene also scales the high
        // band by the flash intensity, so 0 turns the glints off.
        amplitude: 0.5,
        // The high band is followed the same way: the glints shimmer with the hats' density, not flicker per hat.
        attackSeconds: 0.15,
        releaseSeconds: 0.6,
    },
    sprite: {
        // World size of one point; about 2.5 px at the default camera on a 900 px tall view.
        baseSize: 0.034,
        // Additive blending sums overlapping points, so each one is faint.
        baseAlpha: 0.5,
        // Tension shrinks points by this fraction ...
        tensionSizeShrink: 0.3,
        // ... and fades them by this fraction, chosen with the squeeze and the shrink so the light per screen area stays
        // the same at any tension: the squeezed core neither saturates nor dims, and the release after a drop reads as
        // the cloud spreading out, not as a flash (global brightness is the BrightnessMix's job alone).
        tensionAlphaNormalization: 0.14,
    },
    camera: {
        // The cloud fills about 60 percent of the height at this distance and field of view.
        distance: 12,
        fov: 50,
        // Radians per second of cloud rotation at the camera-drift control's full value.
        driftSpeed: 0.25,
        near: 0.5,
        far: 100,
    },
    // A long stall (tab switch, debugger) must not make the clock, the envelopes or the fades jump.
    maxFrameDeltaSeconds: 0.1,
};

export type SpectrumConfig = typeof bassInkSceneConfig.spectrum;
