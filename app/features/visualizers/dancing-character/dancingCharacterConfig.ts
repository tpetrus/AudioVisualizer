// Every tuning constant of the dancing character lives here, so the pure modules stay free of magic numbers.

// ---- The vendored Dance clip (assets/RobotExpressive.glb) ----
// Measured with dancingCharacterClip.test.ts, which parses the GLB and fails if any of these drift from the asset:
// the 'Dance' clip has 81 linear keys at 24 fps, its last key time is 10/3 s, its loop seam is continuous, and the
// strongest accent is the knee dip (LowerLeg.L/R rotation) that sits on the seam. There is no hip translation.

// Name of the animation to loop.
export const DANCE_CLIP_NAME = 'Dance';
// Length of one loop in seconds. The file stores it as a 32-bit float (3.33333325...), which is within 1e-4 of this.
export const DANCE_CLIP_DURATION = 10 / 3;
// The loop is read as 8 beats: the arm pumps fall roughly on a 1/8 grid, and eight beats make the native tempo 144 BPM,
// inside the range that popular music uses, so the clip is rarely sped up or slowed down by much.
export const NATIVE_BEATS_PER_LOOP = 8;
// Tempo at which the clip plays at timeScale 1.
export const NATIVE_BPM = (NATIVE_BEATS_PER_LOOP * 60) / DANCE_CLIP_DURATION;
// Where in the loop (0..1 of one beat) the beat lands: 0 puts the seam knee dip, the strongest accent, on the beat.
export const STEP_PHASE_OFFSET = 0;
// Clip speed while the tempo is unknown: a relaxed sway instead of a frozen pose.
export const DEFAULT_CALM_RATE = 0.8;
// Materials the body color tints. The third material, 'Black', is the eyes and joints and keeps its color.
export const BODY_MATERIAL_NAMES = ['Main', 'Grey'] as const;

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
// The space the robot's dance takes up (width, height, depth in scene units) at scale 1, measured from the clip's
// skinned poses (the arms swing far wider than the body); used to place the camera before the model has loaded.
export const NOMINAL_CHARACTER_SIZE = { width: 6, height: 4.6, depth: 3.3 } as const;

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

// ---- Bass pulse (dancingCharacterBassPulse.ts) ----

// The bass is isolated by its own steep low-pass filter so mids and drums do not leak in.
export const BASS_CUTOFF_HZ = 120;
// ~43 ms at 48 kHz: long enough to hold a full cycle of the lowest bass notes.
export const BASS_FFT_SIZE = 2048;
// Per-frame follower coefficients: the fast follower attacks quickly, the slow one has ~1.5 s of memory, so a hit
// stands out against what came before.
export const BASS_FAST_ATTACK = 0.5;
export const BASS_FAST_RELEASE = 0.2;
export const BASS_SLOW_RATE = 0.01;
// Below this slow level (RMS, 0..1) the source counts as silent and nothing pulses.
export const BASS_SILENCE_FLOOR = 0.005;
// Ratio of fast to slow level that is ignored, and the gain above it that maps to a full pulse.
export const BASS_RATIO_DEADBAND = 1.15;
export const BASS_RATIO_GAIN = 1.5;
// How quickly the output pulse rises and falls per frame: up over a couple of frames, down over ~0.3 s.
export const BASS_PULSE_RISE = 0.45;
export const BASS_PULSE_FALL = 0.12;
