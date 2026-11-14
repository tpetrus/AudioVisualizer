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

// ---- Hub bands and per-band onsets (contract C3, added beside the packed frame; the tracker does not read them) ----

// Bands whose energy the worklet reports to the analysis hub, low to high. Edges in Hz: band b covers
// [HUB_BAND_EDGES_HZ[b], HUB_BAND_EDGES_HZ[b + 1]). Kick and bass share the low end of the spectrum, so the kick and
// bass onset detectors may look at more than their own band to tell them apart.
// Edges above the Nyquist frequency are clamped to it, and every band gets at least one FFT bin, as the three flux
// bands do.
export const HUB_BANDS = ['sub', 'kick', 'bass', 'lowMid', 'mid', 'highs'] as const;
export const HUB_BAND_COUNT = HUB_BANDS.length;
export const HUB_BAND_EDGES_HZ = [20, 60, 130, 300, 800, 4000, 16000] as const;
// Kinds of onset event the worklet emits, in the order of their index in a feature batch.
export const FEATURE_ONSET_BANDS = ['kick', 'bass', 'snare', 'highs'] as const;
export const FEATURE_ONSET_BAND_COUNT = FEATURE_ONSET_BANDS.length;
// Frames the onset detectors may look ahead before deciding that a frame holds an onset. Each frame of look-ahead
// delays every event by one hop (10 ms), so this is capped at 2 by the 30 ms reaction target.
export const ONSET_LOOKAHEAD_FRAMES = 2;

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
// A first lock is a tie when the winner has a dotted rival (4/3 or 3/4 of its lag) whose autocorrelation peak is at least
// this fraction of the winner's. Measured at the first lock (3 s) of the six fixtures: -0.18 (imyourgirl), 0.29
// (syncopationbass2) and 0.35 (syncopationbass) are no tie; 0.52 (syncopation-no-kick), 0.85 (lonley) and 0.87
// (summer2000) are ties. The gap is 0.35 to 0.52 and 0.4 sits in it, 0.05 above the high no-tie track and 0.12 below the
// low tie track, so the margin is thin on the low side. The 3/2 and 2/3 lag factors were tried and rejected: they made
// imyourgirl and syncopationbass tie too, and so lock 5 s late.
export const TEMPO_TIE_MIN_RATIO = 0.4;
// A tie holds the first lock back for at most this long, so the bar-repeat comparison sees a full history (about 8 s).
// Measured at the first lock the 4x and 8x multiples are mostly out of reach, because lags past half the history are
// untrusted.
export const TEMPO_TIE_MAX_DEFER_S = 5;
// The tie goes to the rival only when its bar-repeat score (peak at 4x plus peak at 8x of its own lag) beats the winner's
// by this factor. Measured at 8 s: 1.08 against 0.88 and 1.19 against 0.40 for a true rival, an exact tie at 0.71 against
// 0.71 on a track where the winner is right, so a draw must keep the winner.
export const TEMPO_TIE_SWITCH_FACTOR = 1.1;
// Search window (fraction of a lag) for a peak, and the multiples of a lag compared for a tie (the bar, and two bars).
export const TEMPO_TIE_PEAK_TOLERANCE = 0.03;
// The dotted rivals of a lag, as factors of it (4/3 and 3/4: the two pulses that dotted notes make against the beat).
export const TEMPO_TIE_RIVAL_LAG_FACTORS = [4 / 3, 3 / 4] as const;
export const TEMPO_TIE_MULTIPLES = [4, 8] as const;
// Estimates within this fraction of the held tempo only nudge it (hysteresis), and the held tempo follows by this
// fraction of the difference per estimate.
export const TEMPO_HYSTERESIS = 0.04;
export const TEMPO_SMOOTHING = 0.25;
// A different tempo must win this many consecutive estimates (x TEMPO_UPDATE_SECONDS) before it replaces the held one.
export const TEMPO_SWITCH_ESTIMATES = 4;
// Dotted notes make a pulse at 4/3 of the beat for a few bars at a time without the tempo changing. The tracker may hold
// either octave of the beat, so a rival is compared after folding the ratio into one octave, where 4/3 and 3/4 of the beat
// or of its double become 4/3 and 3/2. Such a rival must win about 8 s of estimates. A longer hold for every rival would be
// simpler, but it makes real song changes late.
export const TEMPO_SYNCOPATION_RATIOS = [4 / 3, 3 / 2] as const;
export const TEMPO_SYNCOPATION_TOLERANCE = 0.02;
export const TEMPO_SYNCOPATION_SWITCH_ESTIMATES = 32;
// Such a rival only counts at this confidence (0..1) or above: measured at 0.15 to 0.41 during dotted passages of a real
// bassline, against 0.5 to 0.9 for a pulse the music really has.
export const TEMPO_SYNCOPATION_MIN_CONFIDENCE = 0.5;
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
// Fraction of the timing error applied to the period per beat (0..1). Small, because a run of added notes near the beat
// would otherwise build up in the period and move the beat clock (measured up to 2.6% on a steady track). Below about 0.05
// the beat grid follows the estimate so exactly that white noise starts to look like a meter.
export const BEAT_PERIOD_GAIN = 0.05;
// Fraction of the gap between the beat period and the tempo estimate closed per beat (0..1).
export const BEAT_TEMPO_FOLLOW = 0.2;
// A peak must exceed the running mean of the envelope by this factor to be trusted as an onset.
export const BEAT_PEAK_MIN_RATIO = 1.3;
// Per-frame smoothing (0..1) of the running mean of the envelope.
export const BEAT_ENVELOPE_MEAN_SMOOTHING = 0.02;
// The phase is searched again after this many consecutive beats without an onset near the prediction. Long enough to ride
// through a two second break with no drums at a usual tempo, because the tempo carries on through one.
export const BEAT_LOST_BEATS = 8;
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

// ---- Per-band onset detection (BandOnsets, runs in the AudioWorklet beside the extractor) ----

// Per detection function, in the order low end (kick and bass), snare range, highs. The function is the mean positive
// rise of log magnitude over the range's bins, per frame.
// A detection value must exceed this floor to count at all. Real hits rise by 0.1 to 2 on this scale. The low end's
// floor is higher because the tails of its sustained notes ripple by 0.05 to 0.07 every few frames; the upper ranges
// are quiet between hits, but the snare range's floor stays above the 0.03 to 0.04 that a kick's attack leaks into it,
// and the soft hat of a sparse groove is as low as 0.04.
export const BAND_ONSET_MIN_FLUX = [0.08, 0.05, 0.03] as const;
// An onset must also reach this fraction of the range's recent loudest hit, so that the weak ripple in a snare's noise
// tail (up to a quarter of the hit) is not a second event. The low end accepts a tenth: a bass note struck again on the
// pitch of the one still sounding changes the spectrum by only that much.
export const BAND_ONSET_RELATIVE_THRESHOLD = [0.1, 0.3, 0.3] as const;
// Half-life in seconds of the "recent loudest hit" of each range. Long enough to bridge a bar of rests at slow tempos,
// short enough to follow a change from a quiet verse to a loud chorus within a few bars.
export const BAND_ONSET_PEAK_HALF_LIFE_SECONDS = 3;
// A frame is an onset only if its detection value is the largest within this many frames before it. With the
// look-ahead (ONSET_LOOKAHEAD_FRAMES) this makes two events of one range at least three frames (30 ms) apart.
export const BAND_ONSET_PAST_FRAMES = 2;
// A low-end onset weaker than this fraction of the low end's recent loudest hit is only believed with company. Weak
// rises are what a sustained note's ripple (0.1), the leak of a snare's noise (0.13) and a bass note struck again on
// the pitch still sounding (0.11 to 0.16) all look like. Only the snare's leak is told apart, by the snare range rising in
// the same instant, so a weak low-end onset is dropped when the snare range is active and kept otherwise: a kick or bass
// note that sounds without a hi-hat must still count.
export const LOW_ONSET_WEAK_FRACTION = 0.25;
// Time constant in seconds of each range's running mean of detection values, the noise floor of its adaptive
// threshold. About a bar at 120 BPM: slow enough that one hit hardly moves it, fast enough to follow a change in how
// busy the music is.
export const BAND_ONSET_MEAN_SECONDS = 0.5;
// An onset must be this many times the running mean of its range. Real music keeps every range moving (sustained
// notes ripple, a snare's noise rustles), so a hit has to stand out of that; a value of 1 would accept anything above
// average. Silence and sparse synthetic grooves have a tiny mean, so there the fixed floor decides.
export const BAND_ONSET_NOISE_FACTOR = [3, 3, 3] as const;
// A range's event within this many frames of its previous event is a ripple of that hit, not a new one, unless it is
// nearly as strong: a drum's body keeps moving for a few frames after the attack (its pitch falls, a struck string rings
// and beats), a snare's noise tail flickers and a hi-hat's ring rustles, while real notes follow each other no faster
// than sixteenth notes at 200 BPM (75 ms). Eight frames is 80 ms, just past that; hats and snare hits are shorter.
export const BAND_ONSET_REFRACTORY_FRAMES = [8, 6, 5] as const;
// What fraction of the previous event's strength an event inside the refractory span needs to count as a second hit.
// A ripple is a fraction of the hit it follows; a hit struck on purpose is of the same order.
export const BAND_ONSET_REFRACTORY_FRACTION = [0.6, 0.6, 0.6] as const;
// What the classifier of a low-end onset looks at: how much the log level of the low end's bins from the bass band
// (HUB_BAND_EDGES_HZ[2], 130 Hz) up to the top of the low end (300 Hz) rose from LOW_ONSET_LAG_FRAMES frames before the onset
// to the onset frame itself, and how much of that rise is left two frames later. A drum's attack spreads over those bins and the
// spread is gone two frames on (synthetic kicks keep 2 to 25 percent), a bass note's harmonics keep sounding (90 to 180
// percent). It is a kick when the rise at the onset reaches the minimum below and no more than the settled fraction of it
// is left; a note with too little up there to judge (a bare sine bass) is a bass note, which a drum never is: the skirt
// of a drum attack is at least 1, and 0.5 is half of the smallest measured.
export const LOW_ONSET_KICK_MIN_SKIRT = 0.5;
export const LOW_ONSET_KICK_MAX_SETTLED = 0.8;

// How many frames back the low end's detection function and the kick/bass classifier look for the level a bin rose from.
// One frame (the plain flux) counts every small ripple of a sustained chord as a rise: a pad held at 174 to 330 Hz gave
// a false bass event about every 120 ms (27 on the pad-lead-groove-110 track) while a drum hit, which steps up and stays
// up, rises just as much from two frames back. Three or more frames smear the onset's time and the classifier's
// baseline too far; two cleared the pad while keeping the drum onsets within the 50 ms the evaluation allows.
export const LOW_ONSET_LAG_FRAMES = 2;
