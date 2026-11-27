import { FLAG_DISTANCE, FLAG_WIDTH, PENCIL_RADIUS } from '../trioColorWaveConfig';

// Every tuning constant of the enhanced look, in one place.

// Dense bars: twice the columns over the same footprint, so the spectrum reads as a finer comb. The first and last
// dense bars sit exactly on the first and last standard bars, and every second one falls between two standard bars.
export const DENSITY_FACTOR = 2;
export const DENSE_COLUMNS = (FLAG_WIDTH - 1) * DENSITY_FACTOR + 1;
export const DENSE_DISTANCE = (FLAG_DISTANCE * (FLAG_WIDTH - 1)) / (DENSE_COLUMNS - 1);
// A little over half the standard radius: the bars are twice as close, so a full radius would merge them into a wall.
export const DENSE_RADIUS = PENCIL_RADIUS * 0.55;

// Light. The emissive gain multiplies the linear color: 1 at Glow 0 (no bloom either), more as Glow rises.
export const EMISSIVE_GAIN_BASE = 1;
export const EMISSIVE_GAIN_PER_GLOW = 0.55;
// How much brighter the last stretch of a bar (its tip) is, as a share of the body color.
export const RIM_STRENGTH = 0.9;
// How much the beat pulse brightens the bars at its peak (0 = not at all).
export const PULSE_BAR_GAIN = 0.8;

// Bloom (see bass-ink/bassInkPost.ts for the same arrangement).
export const BLOOM_RADIUS = 0.6;
export const BLOOM_THRESHOLD = 0.9;
// The bloom's working resolution as a share of the drawing size in device pixels.
export const BLOOM_RESOLUTION_SHARE = 0.5;
// Strength per unit of the Glow slider, and what a full pulse adds on top.
export const BLOOM_STRENGTH_PER_GLOW = 0.45;
export const BLOOM_PULSE_BOOST = 0.35;
// Below this many device pixels on a side the bloom's mip chain would reach zero-size targets, so it is switched off.
export const BLOOM_MIN_SIDE_PX = 32;

// The beat accent (trioAccent.ts).
// At most three accepted triggers per second.
export const ACCENT_MIN_INTERVAL_SECONDS = 1 / 3;
// The pulse's peak at full Beat accent, and the exponential decay time constant after it.
export const ACCENT_PEAK_CAP = 1;
export const ACCENT_DECAY_SECONDS = 0.16;
// The kick band's onset (0..1) must rise through this to count as a trigger of its own.
export const ACCENT_BASS_ONSET_THRESHOLD = 0.5;
// Under reduced motion the pulse peaks at this share of its normal height.
export const ACCENT_REDUCED_MOTION_FACTOR = 0.25;

// Depth haze: at the full Depth slider the farthest sheet fades this far toward the backdrop color. The front sheet is
// never hazed.
export const HAZE_MAX = 0.55;

// Backdrop: a vertical gradient (linear RGB) on a plane behind the farthest sheet. Its opacity is Depth times this.
export const BACKDROP_BOTTOM_COLOR: readonly [number, number, number] = [0.004, 0.004, 0.02];
export const BACKDROP_TOP_COLOR: readonly [number, number, number] = [0.03, 0.012, 0.07];
export const BACKDROP_MAX_OPACITY = 0.9;
export const BACKDROP_WIDTH = 4000;
export const BACKDROP_HEIGHT = 1500;
// How far behind the farthest sheet (world units).
export const BACKDROP_GAP = 300;

// Dust: one Points draw. The box is about the visible area (the camera is 3800 units back with a 10 degree field).
export const DUST_COUNT = 400;
export const DUST_HALF_WIDTH = 900;
export const DUST_HALF_HEIGHT = 420;
export const DUST_DEPTH_NEAR = 400;
export const DUST_DEPTH_FAR = -500;
// Point size in CSS pixels (multiplied by the pixel ratio) and peak opacity at full Dust.
export const DUST_POINT_PIXELS = 2.5;
export const DUST_MAX_OPACITY = 0.7;
// HDR so the bloom picks the brightest specks up a little.
export const DUST_COLOR: readonly [number, number, number] = [1.1, 1.0, 1.5];
// Drift speed in cycles per second, and how far a point wanders from its home (world units).
export const DUST_DRIFT_SPEED = 0.06;
export const DUST_DRIFT_RANGE = 60;
// Fixed seed so every run places the dust the same way.
export const DUST_SEED = 0x7ac3;

// Burst: a pool of rings fired by the accent. They are drawn behind the sheets (between the farthest sheet and the
// backdrop) and centered low, so each one rises from behind the bars like a halo instead of covering them.
// Four rings: a downbeat uses two (the burst and its echo), and the gate allows at most three bursts a second.
export const SHOCKWAVE_POOL_SIZE = 4;
export const SHOCKWAVE_LIFETIME_SECONDS = 1.3;
// Outer radius at the end of its life (world units); a downbeat burst goes this much further.
export const SHOCKWAVE_MAX_RADIUS = 640;
export const SHOCKWAVE_DOWNBEAT_SCALE = 1.3;
// Where the rings are centered: low on the screen (the bars rise from y = BASE_HEIGHT), and this far behind the
// farthest sheet.
export const SHOCKWAVE_CENTER_Y = -150;
export const SHOCKWAVE_BEHIND = 120;
export const SHOCKWAVE_PEAK_STRENGTH = 0.8;
// A downbeat burst is brighter, and is followed by a fainter echo ring after a short delay.
export const SHOCKWAVE_DOWNBEAT_GAIN = 1.4;
export const SHOCKWAVE_ECHO_DELAY_SECONDS = 0.14;
export const SHOCKWAVE_ECHO_GAIN = 0.5;
// The ring's three bands, outside to inside, in the trio's own colors (highs, mids, bass), linear HDR so the bloom
// catches them.
export const SHOCKWAVE_OUTER_COLOR: readonly [number, number, number] = [2.2, 0.55, 0.2];
export const SHOCKWAVE_MID_COLOR: readonly [number, number, number] = [0.35, 0.6, 2.4];
export const SHOCKWAVE_INNER_COLOR: readonly [number, number, number] = [1.2, 0.3, 2.2];
