// Finds where each scheduled click arrived in a recording. Pure: the page only records, this decides. Not part of the
// app bundle.

// A click must rise above this many noise standard deviations, and above this fraction of the loudest sample, so that
// neither a hissy recording nor one loud outlier turns noise into clicks.
export const NOISE_MULTIPLE = 8;
export const PEAK_FRACTION = 0.25;
// The median of the absolute samples times this is the standard deviation of Gaussian noise. Clicks are sparse, so the
// median ignores them.
const MEDIAN_ABS_TO_SIGMA = 1.4826;

export interface DetectInput {
    samples: ArrayLike<number>;
    sampleRate: number;
    // AudioContext time of samples[0].
    startTime: number;
    // AudioContext times the clicks were scheduled at, ascending.
    scheduled: readonly number[];
    // Latest arrival, after the scheduled time, that still counts for a click.
    maxDelaySeconds: number;
}

export interface ClickArrival {
    scheduled: number;
    // null when the click never crossed the threshold in its window.
    arrival: number | null;
    delayMs: number | null;
}

export interface Detection {
    clicks: ClickArrival[];
    noiseFloor: number;
    peak: number;
    threshold: number;
    // True when the first click was missed but most later ones were found: the signature of a true delay longer than
    // the matching window, where each click's sound lands in the next click's window and reads as (delay - interval).
    lateSuspected: boolean;
}

export function estimateNoiseFloor(samples: ArrayLike<number>): number {
    if (samples.length === 0) return 0;
    const magnitudes = new Float32Array(samples.length);
    for (let i = 0; i < samples.length; i++) magnitudes[i] = Math.abs(samples[i]);
    magnitudes.sort();
    return magnitudes[Math.floor(magnitudes.length / 2)] * MEDIAN_ABS_TO_SIGMA;
}

export function detectClicks(input: DetectInput): Detection {
    const { samples, sampleRate, startTime, scheduled, maxDelaySeconds } = input;
    let peak = 0;
    for (let i = 0; i < samples.length; i++) peak = Math.max(peak, Math.abs(samples[i]));
    const noiseFloor = estimateNoiseFloor(samples);
    const threshold = Math.max(noiseFloor * NOISE_MULTIPLE, peak * PEAK_FRACTION);

    const clicks = scheduled.map((time, index): ClickArrival => {
        // A window ends at the next click's scheduled time, so a click that never arrived cannot be matched to the
        // next one's sound. A click later than that is a miss; the tool cannot tell it from the next click anyway.
        const next = index + 1 < scheduled.length ? scheduled[index + 1] : Infinity;
        const endTime = Math.min(time + maxDelaySeconds, next);
        const first = Math.max(0, Math.ceil((time - startTime) * sampleRate));
        const end = Math.min(samples.length, Math.ceil((endTime - startTime) * sampleRate));
        // A threshold of 0 means silence; strict comparison keeps that from matching anything.
        for (let i = first; threshold > 0 && i < end; i++) {
            if (Math.abs(samples[i]) > threshold) {
                const arrival = startTime + i / sampleRate;
                return { scheduled: time, arrival, delayMs: (arrival - time) * 1000 };
            }
        }
        return { scheduled: time, arrival: null, delayMs: null };
    });
    // With one click there is nothing to compare, so it stays an ordinary miss.
    const rest = clicks.slice(1);
    const restFound = rest.filter((click) => click.arrival !== null).length;
    const lateSuspected =
        clicks.length > 1 && clicks[0].arrival === null && restFound * 2 >= rest.length && restFound > 0;
    return { clicks, noiseFloor, peak, threshold, lateSuspected };
}
