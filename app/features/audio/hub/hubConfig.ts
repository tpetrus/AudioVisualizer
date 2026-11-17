// Constants of the audio hub. They live here and not in rhythmConfig.ts because only the hub reads them.

// Frames held for the read at render time. Frames are 10 ms apart, so this holds about 2.5 s: far more than the 0.2 s
// of the largest positive sync offset plus the lag of a worklet batch (tens of milliseconds) that the read needs, with
// room for a hop size that is shorter than expected.
export const HUB_FRAME_CAPACITY = 256;

// Onset events waiting for the render time to reach them. Events come at most a few per frame and wait at most as long
// as the sync offset, so this is generous; when it is full the oldest event is dropped.
export const HUB_PENDING_ONSET_CAPACITY = 128;

// Half-life, in seconds of frame time, of each band's running peak. A band reads 1 at its loudest of roughly the last
// few seconds: a louder section raises the peak at once, and a quieter one lets the peak fall so the band fills the
// range again instead of staying low for the rest of the track.
export const HUB_PEAK_HALF_LIFE_SECONDS = 3;

// The smallest peak a band is divided by, in the frames' energy units (mean of log(1 + 30 * magnitude), not
// normalized). Without it, silence or the hiss of a quiet room would be scaled up to 1. Energy 0 (silence) reads 0 at
// any value, and 0.1 is about a magnitude of 0.0035: below what real music puts in a band.
export const HUB_MIN_PEAK = 0.1;
