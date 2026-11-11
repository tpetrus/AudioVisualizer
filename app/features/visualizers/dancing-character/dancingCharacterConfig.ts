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

// ---- Choosing the dance (dancingCharacterDirector.ts) ----

// One retarget of a motion-capture dance. Every loop is a whole number of 4/4 bars, so any bar line is a point where
// one dance can hand over to another without breaking the step.
export interface DanceDefinition {
    id: string;
    label: string;
    beats: 4 | 8;
}
// The Dance setting's value that lets the dancer change dance by herself.
export const AUTO_DANCE = 'auto';
// In Auto, the dance changes after this many bars (or on a song change), so a long song does not wear one loop out.
export const AUTO_ROTATE_BARS = 8;
// Beats per bar used to find a bar line while the meter is not locked: 4/4 is by far the most common meter.
export const FALLBACK_BEATS_PER_BAR = 4;

// ---- Dance timing (dancingCharacterSync.ts) ----

// Longest frame step the timing uses in seconds, so a background tab coming back does not make a huge jump.
export const MAX_FRAME_DT = 0.1;
// The danceSpeed setting snaps to one of these while the tempo is locked, so the steps stay on the beat:
// half time and on the beat. There is no double time: nobody dances faster than MAX_DANCE_BPM.
export const STEP_MULTIPLES = [0.5, 1] as const;
// The raw tempo is folded by factors of two into [MIN, 2 * MIN) so a half or double time estimate dances the same.
// 80..160 holds the common 4/4 range.
export const NORMALIZED_BPM_MIN = 80;
// There is only so fast a person dances, and no setting exceeds this. Above it the steps fall on every second beat (or
// fewer), which stays on the music, where clamping the speed would drift off it. Half time only ends below
// MAX_DANCE_BPM * this share, so a tempo sitting right at the limit does not flip between the two. While the tempo is
// unknown the calm rate is capped at MAX_DANCE_BPM / NATIVE_BPM instead.
export const MAX_DANCE_BPM = 140;
export const MAX_DANCE_BPM_RELEASE = 0.97;
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
// Camera height above the dancer's center as an angle in radians: slightly from above, so the floor and its beat
// ripple are visible.
export const CAMERA_ELEVATION = 0.12;
// The space the dancer takes up (width, height, depth in meters) at scale 1, measured from the dance's skinned poses
// with both layers at full weight (dancingCharacterScene.test.ts pins it to the real model); used to place the camera
// before the model has loaded.
export const NOMINAL_CHARACTER_SIZE = { width: 1.14, height: 1.68, depth: 0.34 } as const;

// ---- Bass reaction ----

// Fraction of the fitted camera distance the bass pulls the camera in at camera bump 1 and a full pulse. The default
// camera bump (0.6) gives 15 % of the distance, which reads as a clear push on a kick.
export const DOLLY_MAX_FRACTION = 0.25;
// The dolly never exceeds this fraction of the fitted distance, whatever the settings, so the dancer stays in frame.
export const DOLLY_CLAMP_FRACTION = 0.25;
// Seconds for the character to fade in once it has loaded.
export const FADE_IN_SECONDS = 0.5;

// ---- The club set (dancingCharacterClub.ts) ----

// Background and fog share one near-black blue, so whatever fades out (the floor's edge, distant tiles) turns into the
// background exactly, with no visible seam.
export const CLUB_BACKGROUND = '#07080f';
// Linear fog: clear until the dancer's distance plus some margin, then a light haze toward the background color.
export const CLUB_FOG_NEAR = 6;
export const CLUB_FOG_FAR = 24;
// The LED floor: a square grid of tiles in a raised light frame, like a rented event dance floor. The pitch is the
// distance between tile centers and the fill is the share of it the lit tile takes, so the gaps read as thin dark seams.
export const CLUB_TILE_GRID = 10;
export const CLUB_TILE_PITCH = 0.6;
export const CLUB_TILE_FILL = 0.95;
// Half the floor's width, from its center to the inner edge of the frame.
export const CLUB_FLOOR_HALF = (CLUB_TILE_GRID * CLUB_TILE_PITCH) / 2;
// The floor sits this far above the feet so it never z-fights with the soles.
export const CLUB_FLOOR_LIFT = 0.01;
// The frame around the tiles: its width, how far it stands above the floor, and its color (a light surface that picks
// up the colored lights, as the white edging of a real LED floor does).
export const CLUB_FRAME_WIDTH = 0.35;
export const CLUB_FRAME_HEIGHT = 0.05;
export const CLUB_FRAME_COLOR = '#d8dbe6';
// The seams between tiles.
export const CLUB_SEAM_COLOR = '#05060a';
// Each tile is four facets meeting at its center, like the diffuser of an LED panel. The center is at full brightness;
// the outer edges of the front and back facets and of the side facets are dimmed by these factors, which gives the
// pyramid look.
export const CLUB_TILE_FACET_FRONT = 0.78;
export const CLUB_TILE_FACET_SIDE = 0.6;
// Tile colors: saturation and lightness of the rainbow, and the tile brightness while the dancer is calm and at full
// dance (it rises with the dance weight, slowly, as the weight does).
export const CLUB_TILE_SATURATION = 0.95;
export const CLUB_TILE_LIGHTNESS = 0.55;
export const CLUB_TILE_CALM_LEVEL = 0.45;
export const CLUB_TILE_DANCE_LEVEL = 0.9;
// The floor shows one of several patterns (diagonal bands, square rings, columns, a two-tone checkerboard). Each pattern
// spreads this much of the color wheel across the floor and drifts by this many cycles per second.
export const CLUB_PATTERN_HUE_SPREAD = 0.7;
export const CLUB_PATTERN_DRIFT = 0.08;
export const CLUB_PATTERN_COUNT = 4;
// The pattern changes every this many beats (or seconds while no beat is known), cross-fading over the fade time, so a
// change is a slow blend rather than a jump.
export const CLUB_PATTERN_BEATS = 16;
export const CLUB_PATTERN_SECONDS = 8;
export const CLUB_PATTERN_FADE_SECONDS = 1.5;
// The beat ripple: a square ring that leaves the center on each beat and travels outward. Distances are fractions of the
// floor's half width; the front goes a little past the edge so the ring fully leaves. The gain is how far the ring
// lightens the tiles toward white.
export const CLUB_RIPPLE_TRAVEL = 1.1;
export const CLUB_RIPPLE_WIDTH = 0.14;
export const CLUB_RIPPLE_GAIN = 0.45;
// The bass lift on the floor at a full flash, as how far every tile lightens toward white.
export const CLUB_FLOOR_FLASH_LIFT = 0.25;

// Photosensitivity limit: a large-area brightness jump (a spotlight flash or the floor's bass lift) may start at most
// this many times per second, whatever the tempo or the bass does.
export const CLUB_MAX_FLASHES_PER_SECOND = 3;
// Flash strength under reduced motion (1 is full strength).
export const CLUB_REDUCED_MOTION_FLASH_STRENGTH = 0.3;
// Bass level (0..1) that starts a flash.
export const CLUB_FLASH_BASS_THRESHOLD = 0.5;
// Time constant in seconds of the flash fading out. Between flashes brightness only decays, smoothly.
export const CLUB_FLASH_DECAY_SECONDS = 0.15;

// Spotlights: slim beams that hang high above the floor, aimed down toward the middle and swept slowly. The sweep speed
// (rad/s) is the calm speed plus the dance speed term times the dance weight, so the lights wake up with the dancer.
export const CLUB_LIGHT_COLORS = ['#ff3da0', '#31d7ff', '#8a5bff', '#ffb347'] as const;
// Each beam is a narrow cone from its source down: its length, its radius at the far end (it is a point at the source),
// and how many rings it has so the fade below is smooth. The sources sit well above and outside the camera's orbit, so
// no beam comes near the camera at any azimuth or bass dolly.
export const CLUB_CONE_HEIGHT = 9;
export const CLUB_CONE_RADIUS = 0.22;
export const CLUB_CONE_HEIGHT_SEGMENTS = 10;
export const CLUB_CONE_SOURCE_HEIGHT = 7;
export const CLUB_CONE_RING_RADIUS = 5;
// Along the beam (0 at the source, 1 at the far end) the brightness stays full until the start and is gone by the end,
// so a beam dissolves in the air before it reaches the floor instead of ending in a hard edge.
export const CLUB_CONE_FADE_START = 0.1;
export const CLUB_CONE_FADE_END = 0.8;
// How far each beam leans toward the middle, in radians, and how far the sweep swings it either way.
export const CLUB_CONE_TILT = 0.7;
export const CLUB_CONE_SWEEP_ANGLE = 0.1;
export const CLUB_SWEEP_CALM_SPEED = 0.25;
export const CLUB_SWEEP_DANCE_SPEED = 0.9;
// Beam opacity (additive) at rest, scaled up a little with the dance weight, and the flash on top at full strength.
export const CLUB_CONE_BASE_OPACITY = 0.3;
export const CLUB_CONE_FLASH_OPACITY = 0.4;

// Two cheap point lights (no shadows) tint the dancer with the club colors. Point light units, like the rim light.
export const CLUB_SPILL_BASE_INTENSITY = 5;
export const CLUB_SPILL_FLASH_INTENSITY = 14;
export const CLUB_SPILL_COLORS = ['#ff3da0', '#31d7ff'] as const;
