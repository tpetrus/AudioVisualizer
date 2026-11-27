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
        // Every bass bump swells the whole cloud outward by up to this fraction, at once and with no tempo lock needed.
        // It is the pre-lock reaction (the lock takes seconds), so it is deliberately larger than beatPunch: the user
        // asked for instant, clearly visible feedback. Like the punch it moves points apart without adding light.
        swellAmplitude: 0.12,
        // The cloud is tipped toward the camera by this angle (radians). Seen exactly from the side, the flat disc and the
        // ring-shaped formations collapse into a bright line.
        tilt: 0.5,
        // Share of the viewport's smaller half-dimension that the cloud's outermost point reaches when every pulse
        // peaks together at the default controls (breathing, beat punch, swell, the kick-wave cap, the spectrum and the
        // turbulence at full mid level). The scene solves the cloud's world radius for it (framing.ts), so the whole
        // object stays on screen while it pulses, at any window shape. The rest shape therefore fills about half.
        fill: 0.95,
        // Growth of each formation (in FORMATION_NAMES order) on top of its fit, for the flat ones: tipped toward the
        // camera, the torus and the disc are as wide as the sphere but much less tall, so on a wide view they would fill
        // far less of the height. framing.ts caps the growth by the view's width (none on a portrait view), and
        // framing.test.ts checks their real points, with the core and the spray, against the fill across the section
        // swing's tilt range. The most face-on tilt of the swing is what limits it: there, at the peak of every pulse,
        // these leave the torus and the disc at about 94 percent against the 95 percent fill.
        formationGrowth: [1, 1.1, 1, 1.12] as readonly number[],
    },
    bass: {
        // The swell and the glow are the bump itself (see swellFromBump), so there is nothing to tune for the swell.
        // The glow arms at this swell and re-arms only below the lower one, so a pulse that wobbles around one level
        // is one flash, not several.
        glowArm: 0.6,
        glowRearm: 0.25,
        // Peak of a bass glow at full swell. Smaller than a kick flash (0.35): every bass pulse glows, so it is only a
        // lift, and it goes through the BrightnessMix's soft cap and the governor like every other flash.
        glowAmount: 0.25,
    },
    wave: {
        // Kick shockwave: world units per second the front travels, so it crosses the cloud in about a second.
        speed: 7,
        // Thickness (gaussian width) of the front.
        width: 0.7,
        // Seconds for a wave's strength to fall by a factor of e; the front fades before it leaves the cloud.
        decay: 0.7,
        // Outward push of a full-strength kick at the front, in world units.
        amplitude: 0.55,
        // The sum of overlapping waves is limited so a kick train never tears the cloud apart.
        maxDisplacement: 0.8,
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
        amplitude: 0.65,
    },
    turbulence: {
        // Spatial frequency of the swirling displacement (smaller means broader swirls).
        scale: 0.55,
        // Always-on drift, kept small so a resting formation reads as a solid shape yet never looks frozen, plus a share that
        // follows the mid band.
        base: 0.03,
        midGain: 0.1,
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
    depth: {
        // A point at the far end of the range keeps 1 - fade of its size and its alpha, so far points are at most 0.45 of
        // the near ones (under the 0.5 the plan requires): visible, not harsh. Points are additive, so the fade only
        // removes light; it cannot add flashing.
        fade: 0.55,
        // The range is centered on the cloud's own view depth (not the camera distance, so zooming never dims it) and
        // spans this many fitted radii each way, so the nearest part of the cloud is at full strength and the farthest
        // is at the faded end. It follows the fit (framing.ts) because the radius does: near = -radius * halfRange,
        // far = +radius * halfRange, as offsets from the center's depth.
        halfRange: 1,
    },
    core: {
        // A small dense nucleus inside the main cloud gives the object inner structure instead of one surface. It takes
        // this share of the cloud's points, so the total the GPU draws does not grow.
        pointShare: 0.2,
        // Its radius as a share of the fitted shell radius, small enough that its whole pulse envelope stays inside
        // the shell's (framing.ts checks it), so the fit is unchanged.
        radiusScale: 0.38,
        // Always the sphere: a round nucleus reads inside every shell formation.
        formation: 0,
        // The core is the bass's part: it swells much more than the shell, relative to its size ...
        swellAmplitude: 0.35,
        // ... while the absolute displacements (kick waves, spectrum, turbulence) are scaled down, so it pulses as
        // one body and never pokes through the shell.
        displacementScale: 0.35,
        // Its points are packed into a small volume, so each is fainter, or additive blending turns it white.
        alphaScale: 0.6,
    },
    dust: {
        // A sparse field of faint points around everything fills the black void and gives depth and parallax. Its count
        // is this share of the cloud's, capped on a software renderer.
        pointShare: 0.08,
        softwareCap: 800,
        // A shell around the origin that the camera (at distance 12) sits inside, so dust shows in every direction at
        // any orbit angle, and the nearest dust stays well away from the lens.
        innerRadius: 18,
        outerRadius: 45,
        // World size of a dust point: about 2.5 px at distance 30 on a 900 px tall view.
        size: 0.08,
        // Faint on purpose: it is a backdrop.
        alpha: 0.3,
        // Each point twinkles around its own mean by this share of its alpha, with a random phase, so the field's total
        // light stays constant and twinkling can never read as a flash.
        twinkleDepth: 0.5,
        // Twinkle cycles per second at rest; the followed high band speeds it up by up to highGain times this.
        twinkleSpeed: 0.5,
        highGain: 2,
        // Slow rotation of the whole field (radians per second), so it drifts even when the camera is still.
        driftSpeed: 0.01,
        // Dust takes the palette's edge color mixed toward white by this share, so it follows the pickers but stays
        // a neutral backdrop.
        whiteMix: 0.4,
    },
    spray: {
        // Points thrown off the shell on bass hits, from a fixed pool that is reused, newest overwriting oldest.
        poolSize: 2048,
        softwarePoolSize: 256,
        // Points per burst (software renderer: softwarePerBurst).
        perBurst: 160,
        softwarePerBurst: 24,
        // A burst fires when the swell rises through `arm`, re-arms only below `rearm`, and never more often than
        // every minIntervalSeconds, so there are at most 3 bursts a second.
        arm: 0.6,
        rearm: 0.3,
        minIntervalSeconds: 0.34,
        // Outward speed at birth (world units per second); drag slows it with this time constant, so a point travels
        // at most speed * dragSeconds (about 1 world unit) and stays inside the fit's worst-case envelope.
        speed: 3,
        dragSeconds: 0.35,
        // A point lives this long, fading in over attackSeconds and out over the rest, so a burst eases in rather
        // than appearing at once.
        lifeSeconds: 0.9,
        attackSeconds: 0.06,
        // Peak alpha, scaled by the burst strength and the flash-intensity control.
        alpha: 0.4,
        size: 0.05,
    },
    bands: {
        // Points take a color from what moves them, so the reactions read apart by color as well as by motion. A point
        // pushed by a kick wave shifts toward the palette core by up to this share at the wave's cap ...
        bassTint: 0.6,
        // ... and every point would shift by this share of the bass swell. It is 0: the swell follows every bass bump with
        // no rate limit and tints the whole cloud at once, and the picked core can be a saturated red, so a whole-frame
        // hue pulse could become a red flash (WCAG 2.3.1). The kick-wave tint above is a thin moving ring instead.
        swellTint: 0,
        // The glinting points shift toward the palette edge, mixed toward white by highWhite, by this share of the
        // followed high band.
        highTint: 0.7,
        highWhite: 0.5,
        // Every tint keeps the point's own luminance, so it changes the hue only and never adds light or a flash.
    },
    view: {
        // On each section change (each formation transition) the view swings to a new tilt and turn, eased over the
        // transition, like a camera operator reframing. It turns the cloud, not the camera, so the fit (which uses the
        // cloud's largest 3D radius, the same at any angle) still keeps everything on screen.
        // The tilt moves within cloud.tilt +/- tiltSwing (radians), staying clear of edge-on views of the flat disc ...
        tiltSwing: 0.2,
        // ... and the turn by up to +/- yawSwing on top of the drift. The smoothstep over the 2 s transition peaks at 1.5
        // times the average rate, so a full swing turns at most about 0.68 rad (39 degrees) a second, slow enough to
        // read as a reframe rather than a spin.
        yawSwing: 0.45,
        // The swing is full at the camera-drift control's default (0.3) and above, scales down below it, and is off at
        // 0, so a user who wants a still view gets one.
        fullAtDrift: 0.3,
    },
    discFlow: {
        // The galaxy disc's points stream inward along its arms (flowDiscPoint in inkShaders.ts), so the center turns
        // faster than the rim. The speed is the share of the disc's area (squared radius) that flows past per second: at
        // 0.04 a point takes 25 s from the rim to the center, and the rim turns at twist * speed / 2, 0.06 rad/s, on
        // top of the drift, while a point halfway out turns twice as fast.
        speed: 0.04,
        // Each bass swell adds this much speed while it lasts, so a bass hit briefly spins the disc up: a full swell
        // over a third of a second turns a point halfway out by about 13 degrees.
        swellGain: 0.25,
    },
    post: {
        // Trails: each frame keeps the brighter of itself and the previous frame dimmed by `damp` (three's afterimage,
        // a max and not a sum, so trails never add light). The trails control maps 0..1 onto damp 0..dampMax; 0 turns
        // the pass off.
        trailsDampMax: 0.9,
        // Bloom: a soft glow around the brightest areas. The glow control maps 0..1 onto strength 0..strengthMax; 0
        // turns the pass off. Only light above `threshold` blooms, so the faint dust and the cloud's thin edge stay
        // crisp. The strength never follows the music: global brightness stays BrightnessMix's job.
        bloomStrengthMax: 1.2,
        bloomRadius: 0.4,
        bloomThreshold: 0.55,
        // The bloom's blur runs at this share of the drawing size, which costs a quarter of the pixels and looks the
        // same for a soft glow.
        bloomResolutionScale: 0.5,
    },
    camera: {
        // The camera never moves to frame the cloud: the scene fits the cloud's radius to the view instead (cloud.fill).
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
