import type { TrioColorWaveControlValues } from './trioColorWaveControls';

type ControlKey = keyof TrioColorWaveControlValues;

// One sheet of flags showing a slice of the spectrum.
export interface BandDefinition {
    name: string;
    // Keys of the settings controls that hold this band's lower/upper edge (Hz) and height multiplier.
    lowKey: ControlKey;
    highKey: ControlKey;
    heightKey: ControlKey;
    // Analysis window: long for bass (fine frequency detail), short for highs (fast, percussive).
    fftSize: number;
    // How quickly this band's bars fall back, as a fraction of the "Fall speed" setting (on top of the depth-based
    // slowing). The bass needs to fall gently or it looks jumpy.
    fallFactor: number;
    // Spreads each column's value over its neighbors (a Gaussian blur, standard deviation in columns) so a strong
    // frequency becomes a rounded hill instead of a spike next to a dip. The bass has the fewest frequency points per
    // column, so it needs the most.
    blurColumns: number;
    // Anything quieter than this (dB) is drawn as nothing. A higher floor hides faint leakage from other instruments,
    // e.g. the spread of a snare hit into the low frequencies; it only needs to be this high for the bass.
    minDecibels: number;
    // The band is never smoothed less than this, whatever the "Smoothing" setting is.
    minSmoothing: number;
    // The hue runs once from startHue to endHue along the sheet (0..1 of the color wheel).
    startHue: number;
    endHue: number;
}

// Front to back: highs, mids, bass. Hues go by position: red -> orange, blue -> indigo, indigo -> violet.
export const BANDS: readonly BandDefinition[] = [
    {
        name: 'Highs',
        lowKey: 'midsHigh',
        highKey: 'highsHigh',
        heightKey: 'highsHeight',
        fftSize: 1024,
        fallFactor: 1,
        blurColumns: 1.5,
        minDecibels: -90,
        minSmoothing: 0.75,
        startHue: 0,
        endHue: 0.08,
    },
    {
        name: 'Mids',
        lowKey: 'bassHigh',
        highKey: 'midsHigh',
        heightKey: 'midsHeight',
        fftSize: 2048,
        fallFactor: 1,
        blurColumns: 3,
        minDecibels: -90,
        minSmoothing: 0,
        startHue: 0.667,
        endHue: 0.736,
    },
    {
        name: 'Bass',
        lowKey: 'bassLow',
        highKey: 'bassHigh',
        heightKey: 'bassHeight',
        fftSize: 4096,
        fallFactor: 1,
        blurColumns: 7,
        minDecibels: -90,
        minSmoothing: 0.4,
        startHue: 0.736,
        endHue: 0.806,
    },
];

export const ANALYSER_MAX_DECIBELS = -20;

export const FLAG_DEPTH = 8;
export const FLAG_WIDTH = 256;
export const FLAG_DISTANCE = 10;
// Each sheet is FLAG_DEPTH rows deep, so leave room for all of them plus a small gap.
export const SHEET_SPACING = FLAG_DEPTH * FLAG_DISTANCE + 10;
// With the default camera (10° vertical field of view, 3800 units back) the bottom edge of the screen is about
// 326-348 units below center, depending on how far away a row is. Every bar starts at this same level, just below it.
export const BASE_HEIGHT = -356;
// Bars on each sheet further back are taller by a factor of "Growth per sheet" (so heights grow exponentially:
// front = FRONT_HEIGHT_SCALE, next = front * growth, next = front * growth^2), so a tall front sheet doesn't hide them.
export const FRONT_HEIGHT_SCALE = 1.5;
// Each bar is a pencil: a straight six-sided body (PENCIL_RADIUS is the distance from its middle to a corner, in the
// same units as FLAG_DISTANCE) that ends in a sharpened tip TIP_LENGTH long. Bars shorter than the tip are all tip.
export const PENCIL_RADIUS = 4.2;
export const TIP_LENGTH = 26;
// How solid the bars are (1 = opaque).
export const BAR_OPACITY = 0.8;
// Rows get lower from the farthest row (1) to the nearest (0.55), so the bars behind are not hidden by the ones in front.
export const ROW_FALLOFF: readonly number[] = Array.from(
    { length: FLAG_DEPTH },
    (_, row) => 1 - (0.45 * row) / (FLAG_DEPTH - 1),
);

// Band loudness balancing: bars are scaled so a band's recent peak maps to TARGET_LEVEL (0..255), but a quiet
// band is never boosted beyond what a PEAK_FLOOR-level signal would give, so silence stays flat.
export const TARGET_LEVEL = 200;
export const PEAK_FLOOR = 60;
export const PEAK_DECAY = 0.995;

// Bars get lazier the further back they are, from the front row of the front sheet (depth 0) to the last row of the
// last sheet (depth 1). Each row chases the row in front of it, so a hit travels back as a ripple.
//  - rise: the fraction of the gap a bar closes each frame (1 = jump straight up),
//  - fall: how fast a bar drops, as a fraction of the "Fall speed" setting.
export const BACK_RISE_RATE = 0.1;
export const BACK_FALL_FACTOR = 0.25;
