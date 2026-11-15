// Where the audio comes from, as far as delay is concerned. 'file' is the dev file source, the only one that plays
// through the context's destination.
export type CaptureKind = 'screen' | 'device' | 'file';

// Deliberate display delay (look-ahead experiment, D11). 0 unless the experiment is adopted; never a user setting.
export const DISPLAY_DELAY_MS = 0;

// Range and step of the user sync offset. Positive makes beat-driven visuals later, negative earlier.
export const SYNC_OFFSET_MIN_MS = -200;
export const SYNC_OFFSET_MAX_MS = 200;
export const SYNC_OFFSET_STEP_MS = 5;
export const DEFAULT_SYNC_OFFSET_MS = 0;

// Estimated delay from the listener hearing a sound to its samples reaching the AudioContext, per source kind. 0 means
// not measured; the findings document says where each figure comes from. Nothing is subtracted for it automatically:
// the user sync offset is the correction.
export const CAPTURE_DELAY_MS: Readonly<Record<CaptureKind, number>> = Object.freeze({
    screen: 0,
    device: 0,
    file: 0,
});

export interface TimingSettings {
    displayDelayMs: number;
    userSyncOffsetMs: number;
}

// The audio-clock time a render loop should read time-stamped values at.
// renderTime = audioNow - (displayDelayMs + userSyncOffsetMs) / 1000
export function renderTime(audioNow: number, settings: TimingSettings): number {
    return audioNow - (settings.displayDelayMs + settings.userSyncOffsetMs) / 1000;
}

// A stored or typed value as a valid offset: non-numbers and non-finite values give DEFAULT_SYNC_OFFSET_MS, others are
// clamped to the range and rounded to the step.
export function clampSyncOffsetMs(value: unknown): number {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
        return DEFAULT_SYNC_OFFSET_MS;
    }
    const clamped = Math.min(SYNC_OFFSET_MAX_MS, Math.max(SYNC_OFFSET_MIN_MS, value));
    // Adding 0 turns a rounded -0 into 0, so the value never prints or compares as negative zero.
    return Math.round(clamped / SYNC_OFFSET_STEP_MS) * SYNC_OFFSET_STEP_MS + 0;
}

export interface FeatureDelayInput {
    sampleRate: number;
    fftSize: number;
    hopSeconds: number;
    batchFrames: number;
    captureKind: CaptureKind;
}

// Upper bound on how long after a sound a feature frame describing it reaches the main thread:
// half the analysis window + one hop + one batch (batchFrames * hopSeconds) + CAPTURE_DELAY_MS[captureKind] / 1000.
export function featureDelaySeconds(input: FeatureDelayInput): number {
    const halfWindow = input.fftSize / input.sampleRate / 2;
    const batch = input.batchFrames * input.hopSeconds;
    return halfWindow + input.hopSeconds + batch + CAPTURE_DELAY_MS[input.captureKind] / 1000;
}
