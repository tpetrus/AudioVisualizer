// Every tuning constant of the rhythm tracker lives here, so the pure modules stay free of magic numbers and the
// offline evaluation can tune them in one place. Units and ranges are in the comments.

// ---- Front end: onset extraction (runs in the AudioWorklet) ----

// Analysis window in samples. Must be a power of two. ~21 ms at 48 kHz: short enough to localise a drum hit,
// long enough to separate a kick from the mids.
export const FFT_SIZE = 1024;
// Time between analysis frames in seconds. 10 ms gives ~100 frames/s, which pins a beat to within a few ms.
export const HOP_SECONDS = 0.01;
// Frames per message posted by the worklet. 8 frames = ~80 ms and ~12 messages/s, which keeps the main thread quiet.
export const BATCH_FRAMES = 8;
// Name the worklet processor registers under, shared so the main thread creates the right node.
export const RHYTHM_PROCESSOR_NAME = 'rhythm-onset-processor';
// Number of frequency bands whose spectral flux is tracked (kick, mid, high).
export const BAND_COUNT = 3;
// Upper edge of the kick band in Hz.
export const KICK_MAX_HZ = 150;
// Upper edge of the mid band in Hz. Everything above is the high band.
export const MID_MAX_HZ = 2000;
// Pitch classes in the chroma vector.
export const CHROMA_BINS = 12;
// Chroma only uses this range in Hz: below it, FFT bins are wider than a semitone, above it, content is noise.
export const CHROMA_MIN_HZ = 110;
export const CHROMA_MAX_HZ = 2000;
// Gain inside log(1 + gain * magnitude). Magnitudes are scaled so a full-scale sine is 1.0. A larger gain makes flux
// less sensitive to the engine's slow gain changes, but too large a gain flattens loud and quiet hits to the same flux
// and erases the accent that the meter looks for (1000 did on synthetic 3/4); 30 is a compromise. Level changes are
// handled downstream instead: tempo uses peak-normalised bands and novelty ignores uniform level shifts.
export const MAGNITUDE_LOG_GAIN = 30;

// Packed frame layout (Float32 values per frame): flux per band, log energy per band, RMS, chroma.
export const FRAME_FLUX_OFFSET = 0;
export const FRAME_ENERGY_OFFSET = FRAME_FLUX_OFFSET + BAND_COUNT;
export const FRAME_RMS_OFFSET = FRAME_ENERGY_OFFSET + BAND_COUNT;
export const FRAME_CHROMA_OFFSET = FRAME_RMS_OFFSET + 1;
export const FRAME_STRIDE = FRAME_CHROMA_OFFSET + CHROMA_BINS;

// How much each band's flux contributes to the onset envelope used for tempo and beats (kick, mid, high).
export const ONSET_BAND_WEIGHTS = [1, 1, 1] as const;
// Each band's flux is divided by its decaying peak (this half-life in seconds) before the bands are summed, so every
// band contributes 0..1. The floor (flux units) keeps a silent band's noise from being scaled up to full strength.
export const ONSET_PEAK_HALF_LIFE_SECONDS = 4;
export const ONSET_PEAK_FLOOR = 0.001;

// ---- Tempo ----

export const TEMPO_MIN_BPM = 60;
export const TEMPO_MAX_BPM = 200;
// Centre of the log-Gaussian tempo prior in BPM, and its width in octaves. The prior only breaks octave ties.
export const TEMPO_PRIOR_BPM = 120;
export const TEMPO_PRIOR_SIGMA_OCTAVES = 1;
// Seconds of onset envelope that the autocorrelation looks at.
export const TEMPO_HISTORY_SECONDS = 8;
// No estimate is made until this much envelope exists, in seconds.
export const TEMPO_MIN_HISTORY_SECONDS = 3;
// Seconds between tempo estimates.
export const TEMPO_UPDATE_SECONDS = 0.25;
// Weight of the autocorrelation at twice the lag when scoring a lag (rewards a pulse that repeats every other beat).
export const TEMPO_DOUBLE_LAG_WEIGHT = 0.5;
// The comb refinement searches +-4% around the coarse peak, in steps of 0.1%.
export const TEMPO_REFINE_RANGE = 0.04;
export const TEMPO_REFINE_STEP = 0.001;
// Number of autocorrelation multiples (1x, 2x, 3x, 4x the lag) the comb adds up. More multiples give a finer tempo.
export const TEMPO_COMB_PARTIALS = 4;
// A normalised autocorrelation peak of this height (0..1) counts as full confidence.
export const TEMPO_FULL_CONFIDENCE_PEAK = 0.4;
// Competing peaks closer than this many octaves to the winner (or a whole multiple or fraction of it, up to
// TEMPO_RELATED_MAX_MULTIPLE) are the same pulse, not rivals.
export const TEMPO_COMPETITOR_EXCLUSION_OCTAVES = 0.1;
export const TEMPO_RELATED_MAX_MULTIPLE = 4;
// A peak at the winning lag divided by one of these takes over if it scores at least this fraction (0..1) of the
// winner: the beat is the fastest well-supported pulse, not the bar. Searched within +-this fraction of the lag.
export const TEMPO_FASTER_DIVISORS = [2, 3] as const;
export const TEMPO_FASTER_PULSE_RATIO = 0.7;
export const TEMPO_FASTER_TOLERANCE = 0.04;
// Confidence (0..1) needed to lock a first tempo.
export const TEMPO_LOCK_CONFIDENCE = 0.2;
// Estimates within this fraction of the held tempo only nudge it (hysteresis), and the held tempo follows by this
// fraction of the difference per estimate.
export const TEMPO_HYSTERESIS = 0.04;
export const TEMPO_SMOOTHING = 0.25;
// A different tempo must win this many consecutive estimates (x TEMPO_UPDATE_SECONDS) before it replaces the held one.
export const TEMPO_SWITCH_ESTIMATES = 4;
// The tempo is dropped (back to unknown) after this many consecutive estimates below the confidence floor.
export const TEMPO_LOSE_CONFIDENCE = 0.08;
export const TEMPO_LOSE_ESTIMATES = 40;

// ---- Beat tracking ----

// Seconds of onset envelope the beat tracker keeps for phase initialisation and peak search.
export const BEAT_HISTORY_SECONDS = 6;
// The beat grid is first aligned once this many seconds of envelope exist.
export const BEAT_INIT_MIN_SECONDS = 3;
// Number of past beats the initial phase alignment sums over.
export const BEAT_INIT_PERIODS = 8;
// Half-width of the window around a predicted beat where an onset peak may correct it, as a fraction of the period.
// It is also how long a beat is held back before being declared, so the correction can see the onset.
export const BEAT_WINDOW_FRACTION = 0.2;
// Fraction of the timing error applied to the phase per beat (0..1). Higher locks faster but jitters more.
export const BEAT_PHASE_GAIN = 0.4;
// Fraction of the timing error applied to the period per beat (0..1).
export const BEAT_PERIOD_GAIN = 0.1;
// Fraction of the gap between the beat period and the tempo estimate closed per beat (0..1).
export const BEAT_TEMPO_FOLLOW = 0.2;
// A peak must exceed the running mean of the envelope by this factor to be trusted as an onset.
export const BEAT_PEAK_MIN_RATIO = 1.3;
// Per-frame smoothing (0..1) of the running mean of the envelope.
export const BEAT_ENVELOPE_MEAN_SMOOTHING = 0.02;
// The phase is searched again after this many consecutive beats without an onset near the prediction.
export const BEAT_LOST_BEATS = 4;
// The grid is rebuilt when the tempo estimate and the beat period differ by more than this fraction.
export const BEAT_REINIT_TEMPO_RATIO = 0.12;

// ---- Meter ----

// Half-life in seconds of everything the meter has learned (continuous forgetting).
export const FORGETTING_HALF_LIFE_SECONDS = 20;
// No meter is reported before this many beats (3 bars of 4).
export const METER_MIN_BEATS = 12;
// Number of recent beat accents kept for the lag autocorrelation (about 4 bars at 8 beats).
export const METER_LAG_RING_BEATS = 32;
// Weights of the three accent cues; they sum to 1. Kick onset, overall onset, harmonic change.
export const ACCENT_KICK_WEIGHT = 0.4;
export const ACCENT_TOTAL_WEIGHT = 0.3;
export const ACCENT_CHROMA_WEIGHT = 0.3;
// Smallest mean harmonic change (1 - cosine, 0..1) the chroma cue is divided by. Real chord changes measure ~0.1-0.5.
export const ACCENT_CHROMA_FLOOR = 0.05;
// Weight of the downbeat accent contrast and of the lag autocorrelation in a meter's score.
export const METER_CONTRAST_WEIGHT = 1;
export const METER_LAG_WEIGHT = 0.5;
// Score bonus for 4 (the prior): 4/4 is by far the most common meter, so 3 has to earn its place.
export const METER_PRIOR_FOUR = 0.05;
// A score margin of this size between the two meters is full confidence (1.0).
export const METER_MARGIN_FULL = 0.4;
// Confidence (0..1) needed to leave "unsure", and the confidence below which a meter falls back to "unsure".
export const METER_ENTER_CONFIDENCE = 0.3;
export const METER_EXIT_CONFIDENCE = 0.1;
// Bars a candidate must keep winning before it is reported (entering) or replaces the current meter (switching),
// and bars of low confidence before the meter is dropped.
export const METER_ENTER_BARS = 2;
export const METER_SWITCH_BARS = 3;
export const METER_EXIT_BARS = 2;
// The downbeat position changes only if the new one beats the current one by this much contrast.
export const METER_PHASE_SWITCH_MARGIN = 0.1;
// Fraction of the meter's evidence kept when the beat grid is rebuilt (the beat numbering is no longer comparable).
export const METER_GRID_RESET_KEEP = 0.5;
// Visualizers should only treat the meter as real above this confidence (0..1).
export const METER_VISUAL_CONFIDENCE = 0.5;

// ---- Song boundaries ----

// Frame RMS (0..1, full scale = 1) below which the source counts as silent, and how long it must stay silent in
// seconds before it is a hard reset.
export const SILENCE_FLOOR_RMS = 0.002;
export const SILENCE_TIMEOUT_SECONDS = 1;
// Novelty compares the recent seconds with the preceding ones, in bins of this many seconds.
export const NOVELTY_BIN_SECONDS = 0.25;
export const NOVELTY_RECENT_SECONDS = 6;
export const NOVELTY_PREVIOUS_SECONDS = 30;
// Novelty is not computed until this many seconds precede the recent window.
export const NOVELTY_MIN_PREVIOUS_SECONDS = 8;
// Scales that turn the band-balance distance (compressed-log units, uniform level shift removed) and the chroma distance (1 - cosine) into 0..1
// parts of the novelty score; the two parts are averaged.
export const NOVELTY_ENERGY_SCALE = 0.5;
export const NOVELTY_CHROMA_SCALE = 0.3;
// Novelty at or above this is a soft reset.
export const NOVELTY_THRESHOLD = 1;
// A tempo estimate this far (as a fraction) from the reference tempo, held for TEMPO_JUMP_SECONDS, is a soft reset.
export const TEMPO_JUMP_RATIO = 0.05;
export const TEMPO_JUMP_SECONDS = 3;
// Octave relationships (half, double) are not tempo jumps; this is the tolerance in octaves.
export const TEMPO_JUMP_OCTAVE_TOLERANCE = 0.06;
// Tempo confidence needed for an estimate to count towards the reference tempo or a jump.
export const TEMPO_JUMP_MIN_CONFIDENCE = 0.3;
// Fraction of the gap the reference tempo closes per estimate while the tempo is steady (0..1).
export const TEMPO_REFERENCE_FOLLOW = 0.1;
// A soft reset keeps this fraction of the accumulated evidence (0..1).
export const SOFT_RESET_KEEP = 0.2;

// ---- Analyzer outputs ----

// Seconds of frames kept for measuring beat features.
export const FEATURE_HISTORY_SECONDS = 4;
// Half-width in seconds around a beat whose summed onset flux is that beat's accent. A sum, not the maximum: with a
// window this wide the maximum can pick up the neighbouring beat's onset.
export const BEAT_NEAR_SECONDS = 0.06;
// Per-frame decay (0..1) of the displayed band onsets and novelty, so a short hit stays visible for a few frames.
export const BAND_ONSET_DECAY = 0.9;
export const NOVELTY_DISPLAY_DECAY = 0.995;
// Per-frame smoothing (0..1) of the running average used to judge whether a band's flux is an onset.
export const BAND_FLUX_MEAN_SMOOTHING = 0.02;
// A band flux this many times its running average is a full-strength onset (1.0).
export const BAND_ONSET_FULL_RATIO = 3;
// Per-frame smoothing (0..1) of the exposed chroma.
export const CHROMA_DISPLAY_SMOOTHING = 0.1;
// Phase is extrapolated at most this many seconds past the newest analysed frame, so a stalled worklet freezes it.
export const PHASE_EXTRAPOLATE_MAX_SECONDS = 1.5;
