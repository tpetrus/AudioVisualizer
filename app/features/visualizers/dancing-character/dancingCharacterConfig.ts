// Every tuning constant of the dancing character lives here, so the pure modules stay free of magic numbers.

// ---- The procedural dance (dancingCharacterDanceClip.ts) ----

// The dance is built in code for the MakeHuman rig (assets/MakeHumanDancer.glb), which ships without animation. It is
// a loop of four identical bounces, one per beat, with accents (arm sway, head nod) that only play while the bar is
// known, so the loop length is a whole bar of 4/4.
export const DANCE_CLIP_BEATS = 4;
// Tempo at which the clip plays at timeScale 1. 120 BPM sits in the middle of the range that popular music uses, so the
// clip is rarely sped up or slowed down by much.
export const NATIVE_BPM = 120;
// Length of one loop in seconds (2 s).
export const DANCE_CLIP_DURATION = (DANCE_CLIP_BEATS * 60) / NATIVE_BPM;
// The number of beats the clip contains, under the name the timing spec uses.
export const NATIVE_BEATS_PER_LOOP = DANCE_CLIP_BEATS;
// Where in the loop (0..1 of one beat) the beat lands: 0 puts the knee dip, the lowest point of the bounce, on the beat.
export const STEP_PHASE_OFFSET = 0;
// Materials the body color tints: the model's single skin material.
export const BODY_MATERIAL_NAMES = ['Skin'] as const;
// Bones the dance drives, by the names three.js gives them (GLTFLoader strips the dots, so 'upperarm01.L' loads as
// 'upperarm01L'). The clip is not built when any is missing, and the figure then keeps its rest pose.
export const DANCE_REQUIRED_BONES = [
    'root',
    'spine05',
    'spine04',
    'spine03',
    'spine02',
    'spine01',
    'clavicleL',
    'clavicleR',
    'upperarm01L',
    'upperarm01R',
    'lowerarm01L',
    'lowerarm01R',
    'upperleg01L',
    'upperleg01R',
    'lowerleg01L',
    'lowerleg01R',
    'footL',
    'footR',
    'neck02',
    'head',
] as const;
// Seconds for the accent layer to fade in or out (exponential time constant), so the arms and head ease into the
// bar-locked moves instead of snapping.
export const ACCENT_EASE_SECONDS = 0.3;

// ---- Dance timing (dancingCharacterSync.ts) ----

// Longest frame step the timing uses in seconds, so a background tab coming back does not make a huge jump.
export const MAX_FRAME_DT = 0.1;
// The danceSpeed setting snaps to one of these while the tempo is locked, so the steps stay on the beat:
// half time, on the beat, double time.
export const STEP_MULTIPLES = [0.5, 1, 2] as const;
// The raw tempo is folded by factors of two into [MIN, 2 * MIN) so a half or double time estimate dances the same.
// 80..160 holds the common 4/4 range and the native 144 BPM.
export const NORMALIZED_BPM_MIN = 80;
// How fast timeScale approaches its target, in 1/seconds (exponential). About 0.3 s to settle, so locking looks smooth.
export const TIME_SCALE_SLEW_RATE = 3;
// Hard limit on how fast timeScale may change, in timeScale units per second, so a tempo jump never snaps the dance.
export const MAX_TIME_SCALE_CHANGE_PER_SECOND = 1;
// timeScale never goes below this, so the dancer cannot freeze (a frozen pose reads as a crash).
export const MIN_TIME_SCALE = 0.1;
// How strongly the beat-slot error (in beats) is closed, in 1/seconds. About 0.3 s time constant: quick, not twitchy.
export const PHASE_CORRECTION_GAIN = 3;
// The phase correction per second is limited to this much of a loop, so catching up is a visible speed change
// (at most about 20 % at 144 BPM) rather than a teleport.
export const MAX_PHASE_NUDGE_PER_SECOND = 0.06;

// Clip speed while the tempo is unknown, before the danceSpeed setting: the clip's own native rate.
export const CALM_TIME_SCALE = 1;
// How much of the dance shows while the tempo is unknown (1 is the full dance while locked): a relaxed sway.
export const CALM_DANCE_WEIGHT = 0.35;
// How fast the dance weight approaches its target, in 1/seconds (exponential). A time constant of 0.2 s, so about
// 0.6 s to settle.
export const DANCE_WEIGHT_RATE = 5;

// ---- Camera orbit (dancingCharacterOrbit.ts) ----

// Tempo range the orbit speed is mapped over, in BPM.
export const ORBIT_MIN_BPM = 60;
export const ORBIT_MAX_BPM = 180;
// Angular speed in rad/s at ORBIT_MIN_BPM (and when the tempo is unknown) at orbit speed setting 1: a slow drift.
export const ORBIT_BASE_SPEED = 0.06;
// Angular speed in rad/s at ORBIT_MAX_BPM at setting 1: lively but still comfortable to watch.
export const ORBIT_MAX_SPEED = 0.22;
// How fast the orbit speed approaches its target, in 1/seconds (exponential).
export const ORBIT_SLEW_RATE = 2;
// Hard limit on the orbit speed change in rad/s per second, so an octave flip in the tempo is not felt as a jerk.
export const ORBIT_MAX_CHANGE_PER_SECOND = 0.1;

// ---- Camera framing (dancingCharacterFraming.ts) ----

// The fitted box takes 1 / margin of the view at zoom 1, leaving some room around the dancer.
export const FRAMING_MARGIN = 1.15;
// Camera height above the dancer's center as an angle in radians: slightly from above, so the floor ring is visible.
export const CAMERA_ELEVATION = 0.12;
// The space the dancer takes up (width, height, depth in meters) at scale 1, measured from the dance's skinned poses
// with both layers at full weight (dancingCharacterScene.test.ts pins it to the real model); used to place the camera
// before the model has loaded.
export const NOMINAL_CHARACTER_SIZE = { width: 0.95, height: 1.7, depth: 0.6 } as const;

// ---- Bass reaction ----

// Fraction of the fitted camera distance the bass pulls the camera in at camera bump 1 and a full pulse. The default
// camera bump (0.6) gives 15 % of the distance, which reads as a clear push on a kick.
export const DOLLY_MAX_FRACTION = 0.25;
// The dolly never exceeds this fraction of the fitted distance, whatever the settings, so the dancer stays in frame.
export const DOLLY_CLAMP_FRACTION = 0.25;
// Largest squash of the character's height at full bass (the width grows by half of it) and its lift, in scene units.
export const BASS_SQUASH = 0.08;
export const BASS_LIFT = 0.12;
// Seconds for the character to fade in once it has loaded.
export const FADE_IN_SECONDS = 0.5;

// ---- The club set (dancingCharacterClub.ts) ----

// Background and fog share one near-black blue, so whatever fades out (the floor's edge, distant tiles) turns into the
// background exactly, with no visible seam.
export const CLUB_BACKGROUND = '#07080f';
// Linear fog: clear until the dancer's distance plus some margin, then a light haze toward the background color.
export const CLUB_FOG_NEAR = 6;
export const CLUB_FOG_FAR = 24;
// The LED floor is a square grid of tiles clipped to a circle. The pitch is the distance between tile centers and the
// fill is the share of it the lit square takes, so the gaps between tiles read as the dark frame of an LED panel.
export const CLUB_TILE_GRID = 16;
export const CLUB_TILE_PITCH = 0.5;
export const CLUB_TILE_FILL = 0.9;
// Tiles beyond this radius are not built; the ones inside fade out over the last stretch of it (see
// CLUB_FLOOR_FADE_START), so the edge is never seen at any orbit angle.
export const CLUB_FLOOR_RADIUS = (CLUB_TILE_GRID * CLUB_TILE_PITCH) / 2;
// Where the fade starts, as a fraction of the floor radius.
export const CLUB_FLOOR_FADE_START = 0.45;
// The floor sits this far above the feet so it never z-fights with the soles.
export const CLUB_FLOOR_LIFT = 0.01;
// Tile brightness at rest (a share of the floor color), the alternation between neighbors, the slow idle shimmer and the
// beat pulse (smooth, a cosine of the beat phase, so it never jumps).
export const CLUB_TILE_IDLE = 0.3;
export const CLUB_TILE_CHECKER = 0.25;
export const CLUB_TILE_SHIMMER = 0.06;
export const CLUB_TILE_SHIMMER_RATE = 0.6;
export const CLUB_TILE_BEAT_PULSE = 0.14;
// The beat ripple: a ring that leaves the center on each beat and travels outward. Distances are fractions of the floor
// radius; the front goes a little past the edge so the ring fully leaves. The gain is how strongly the ring lights the
// tiles in the accent color.
export const CLUB_RIPPLE_TRAVEL = 1.1;
export const CLUB_RIPPLE_WIDTH = 0.14;
export const CLUB_RIPPLE_GAIN = 1.3;
// The bass lift on the floor, as a share of the floor color and of the accent color, at a full flash.
export const CLUB_FLOOR_FLASH_FLOOR = 1.4;
export const CLUB_FLOOR_FLASH_ACCENT = 0.3;

// Photosensitivity limit: a large-area brightness jump (a spotlight flash or the floor's bass lift) may start at most
// this many times per second, whatever the tempo or the bass does.
export const CLUB_MAX_FLASHES_PER_SECOND = 3;
// Flash strength under reduced motion (1 is full strength).
export const CLUB_REDUCED_MOTION_FLASH_STRENGTH = 0.3;
// Bass level (0..1) that starts a flash.
export const CLUB_FLASH_BASS_THRESHOLD = 0.5;
// Time constant in seconds of the flash fading out. Between flashes brightness only decays, smoothly.
export const CLUB_FLASH_DECAY_SECONDS = 0.15;

// Spotlights: cones hanging above the floor, aimed at the middle and swept slowly. The sweep speed (rad/s) is the calm
// speed plus the dance speed term times the dance weight, so the lights wake up with the dancer.
export const CLUB_LIGHT_COLORS = ['#ff3da0', '#31d7ff', '#8a5bff', '#ffb347'] as const;
export const CLUB_CONE_HEIGHT = 5;
export const CLUB_CONE_RADIUS = 0.8;
export const CLUB_CONE_RING_RADIUS = 3.6;
// How far each cone leans toward the middle, in radians, and how far the sweep swings it either way.
export const CLUB_CONE_TILT = 0.45;
export const CLUB_CONE_SWEEP_ANGLE = 0.3;
export const CLUB_SWEEP_CALM_SPEED = 0.25;
export const CLUB_SWEEP_DANCE_SPEED = 0.9;
// Cone opacity (additive) at rest, scaled up a little with the dance weight, and the flash on top at full strength.
export const CLUB_CONE_BASE_OPACITY = 0.07;
export const CLUB_CONE_FLASH_OPACITY = 0.2;

// Two cheap point lights (no shadows) tint the dancer with the club colors. Point light units, like the rim light.
export const CLUB_SPILL_BASE_INTENSITY = 5;
export const CLUB_SPILL_FLASH_INTENSITY = 14;
export const CLUB_SPILL_COLORS = ['#ff3da0', '#31d7ff'] as const;
