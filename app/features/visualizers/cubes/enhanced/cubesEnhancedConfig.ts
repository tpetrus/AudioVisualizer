// Tunables of the enhanced cubes look. Every number the look, its state and its shaders use lives here, so a retune
// (for the measured frame rate, or for the color pipeline) never touches the logic.
export const cubesEnhancedConfig = {
    // 'glass' keeps the basic look's clear, partly transparent cubes. 'opaqueEmissive' is the measured fallback for a
    // GPU that cannot hold 60 fps with bloom over 1800+ transparent, double-sided instances (plan D10, K1).
    cubeMaterial: 'glass' as 'glass' | 'opaqueEmissive',

    // The output pass uses the renderer's own tone mapping; 'none' is what the basic look renders with. Exposure is a
    // multiplier on top of it.
    toneMapping: 'none' as 'none' | 'aces',
    exposure: 1,

    // Light constants relative to the basic look's. Left at 1 so the glass keeps the hand-tuned brightness; the
    // composer renders in linear light and the output pass applies the same sRGB encoding the canvas would have.
    lights: {
        keyScale: 1,
        fillScale: 1,
        ambientScale: 1,
        keyColor: 0xffffff,
        fillColor: 0xaab4ff,
        ambientColor: 0xffffff,
        environmentScale: 1,
    },

    post: {
        // Share of the drawing size the bloom works at (half resolution).
        bloomResolutionScale: 0.5,
        // The most strength a full drive and a full Glow control give.
        bloomStrengthMax: 0.9,
        bloomRadius: 0.55,
        // Only the raised, bright cubes and particles pass this luminance.
        bloomThreshold: 0.55,
        // Below this many device pixels on a side the bloom's mip chain reaches zero-size targets, so it is off.
        bloomMinSidePx: 32,
    },

    // Backdrop: a dark glossy plane behind the grid, seen through the gaps and the glass.
    backdrop: {
        // Behind the resting cubes (z 0) and their tilted corners.
        z: -3,
        size: 260,
        // Brightness of the resting gradient relative to the resting cube color, and its floor in the corners.
        base: 0.06,
        vignette: 0.35,
        // A faint horizontal sheen that reads as a polished surface.
        sheen: 0.05,
        // Same shape as the basic look's flash (capped and gamma-compensated), but capped lower: behind bloom and the
        // glowing cubes the basic look's 0.6 read as a full-screen flash.
        flashMax: 0.35,
        flashGamma: 2.2,
        fogColor: 0x05060a,
        fogDensity: 0.011,
    },

    // The glass is the same material as cubeGrid.ts. The emissive term gives bloom something to pick up.
    material: {
        glass: {
            color: 0xffffff,
            metalness: 0.5,
            roughness: 0,
            clearcoat: 1,
            clearcoatRoughness: 0,
            ior: 1.3,
            opacity: 0.8,
            emissiveBase: 0.12,
            emissiveFlash: 0.12,
        },
        opaqueEmissive: {
            color: 0xffffff,
            metalness: 0.2,
            roughness: 0.3,
            clearcoat: 0.4,
            clearcoatRoughness: 0.2,
            ior: 1.3,
            opacity: 1,
            emissiveBase: 0.6,
            emissiveFlash: 0.4,
        },
    },

    // GPU grid effects, in grid units (one cube is 1).
    gridFx: {
        // How far a full-strength beat wave lifts a cube toward the viewer, and its spatial frequency (radians per cube).
        waveHeight: 0.7,
        waveFrequency: 0.32,
        // How far a full shatter pushes a cube away from the grid's center and toward or away from the viewer.
        shatterPush: 2.4,
        shatterLift: 2.2,
    },

    particles: {
        // The fixed size of the preallocated seed buffer; Particles scales how many are drawn.
        count: 1400,
        seed: 0x9e3779b1,
        // The volume they fill, in world units (x, y, depth).
        spreadX: 64,
        spreadY: 40,
        depthMin: -2,
        depthMax: 9,
        // Rise speed in units per second, and sway.
        riseSpeed: 0.9,
        sway: 0.8,
        // Point size in pixels at the grid's distance, and the brightest a particle gets (above 1 so bloom picks it up).
        size: 5,
        brightness: 1.6,
        alpha: 0.75,
        // The share of a particle's size that follows the emit level.
        emitSize: 0.9,
    },

    // Motion on the scene-root group (D11). The grid has a margin of one cell on each side, so at the widest view
    // the combined offset of dolly, drift and tilt must stay under one cell (a test checks this with these numbers).
    motion: {
        // World units the group moves along the view axis at motionDolly 1 (away from the camera is negative).
        dollyDistance: 0.5,
        // World units it slides sideways, and radians it tilts, at motionDrift 1.
        driftSlide: 0.2,
        driftTilt: 0.003,
        // The camera distance and the widest half-width of the grid, for the edge-safety check.
        cameraDistance: 32,
        widestHalfWidth: 32,
    },

    fx: {
        // Longest frame the state integrates, in seconds (a stalled tab must not jump).
        maxDt: 0.1,
        // Bloom drive: a floor, plus the flash and the average band level.
        bloomBase: 0.3,
        bloomFlash: 0.35,
        bloomBands: 0.3,
        // The flash every light-like term follows (backdrop, cube glow, bloom, particles) is the bass pulse through a
        // swell-and-fade envelope (seconds): a short attack so it still lands on the hit, and a long release so a kick
        // glows and fades instead of blinking.
        flashAttack: 0.08,
        flashRelease: 0.7,
        // Particle emission follows the flash and the band energy; it rises fast and falls slowly (seconds).
        emitFlash: 0.6,
        emitBands: 0.5,
        emitAttack: 0.05,
        emitRelease: 0.4,
        // The beat wave: its strength with a lock, how much the flash adds, and how fast it fades in (per second).
        waveBase: 0.45,
        waveFlash: 0.4,
        waveRamp: 2,
        // A bass drop is a rise of the flash over its own slow average (seconds) past this much, above this level.
        shatterSlowTau: 0.18,
        shatterRise: 0.22,
        shatterMinFlash: 0.35,
        shatterDecayTau: 0.28,
        shatterCooldown: 0.3,
        // The dolly eases in after a bar lock (per second).
        dollyRamp: 2,
        // Drift is two slow sines (radians per second).
        driftRateA: 0.11,
        driftRateB: 0.173,
        // Reduced motion: no dolly or drift, and the flash-like terms are capped low so nothing flashes full screen.
        reduced: {
            bassFlashMax: 0.2,
            shatterMax: 0.1,
            bloomMax: 0.35,
            waveMax: 0.25,
        },
    },
} as const;
