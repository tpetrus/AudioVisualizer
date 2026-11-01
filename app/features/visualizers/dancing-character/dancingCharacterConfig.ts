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

// Largest fraction of the camera distance the bass pulls the camera in at bass bump 1: felt, not nauseating.
export const MAX_ZOOM_KICK = 0.04;
// Largest squash of the character's height at full bass (the width grows by half of it) and its lift, in scene units.
export const BASS_SQUASH = 0.08;
export const BASS_LIFT = 0.12;
// Seconds for the character to fade in once it has loaded.
export const FADE_IN_SECONDS = 0.5;
// Background color when the sky image is missing or fails to load.
export const FALLBACK_BACKGROUND = '#0b1020';
