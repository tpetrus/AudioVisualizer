import { RhythmAnalyzer } from '../../../app/features/rhythm/rhythmAnalyzer';

// A song change with the time of the analyzed frame that raised it.
export interface SongChangeEvent {
    time: number;
}

// Digital silence: every sample of the stretch is below this magnitude. 1e-4 is about -80 dBFS, far under any music or
// room noise and above the exact zeros a muted or paused source produces, so only a real mute counts.
export const SILENCE_THRESHOLD = 1e-4;

// A stretch must last this long to be a silence the app resets on on purpose.
export const MIN_SILENCE_SECONDS = 1;

// A reset raised this long after a silence ended still belongs to it, because the app's detector reacts to the end of the
// silence as well as to its length.
export const SILENCE_GRACE_SECONDS = 1;

export interface SilenceStretch {
    start: number;
    end: number;
}

// Every stretch of at least MIN_SILENCE_SECONDS in which all samples are below SILENCE_THRESHOLD.
export function findSilences(pcm: Float32Array, sampleRate: number): SilenceStretch[] {
    const minSamples = Math.ceil(MIN_SILENCE_SECONDS * sampleRate);
    const stretches: SilenceStretch[] = [];
    let runStart = -1;
    const close = (runEnd: number): void => {
        if (runStart >= 0 && runEnd - runStart >= minSamples) {
            stretches.push({ start: runStart / sampleRate, end: runEnd / sampleRate });
        }
        runStart = -1;
    };
    for (let i = 0; i < pcm.length; i++) {
        if (Math.abs(pcm[i]) < SILENCE_THRESHOLD) {
            if (runStart < 0) runStart = i;
        } else {
            close(i);
        }
    }
    close(pcm.length);
    return stretches;
}

// Song changes that no silence explains: those not raised during, or within SILENCE_GRACE_SECONDS after, a silence.
export function countUnexplainedChanges(
    events: readonly SongChangeEvent[],
    silences: readonly SilenceStretch[],
): number {
    return events.filter(
        (event) => !silences.some((s) => event.time >= s.start && event.time <= s.end + SILENCE_GRACE_SECONDS),
    ).length;
}

// The replay reports only the final songChangeCount, but the silence rule needs when each change happened. This wraps
// the analyzer's pushFrame, watches the counter after each frame and records the frame time of every rise. It changes
// nothing the analyzer sees. The wrapper is put back when `run` ends, even if it throws.
export function recordSongChanges<T>(run: () => T): { result: T; events: SongChangeEvent[] } {
    const prototype = RhythmAnalyzer.prototype;
    // The original is always called back with its own `this` through apply below.
    // eslint-disable-next-line @typescript-eslint/unbound-method
    const original = prototype.pushFrame;
    const events: SongChangeEvent[] = [];
    prototype.pushFrame = function (this: RhythmAnalyzer, ...args: Parameters<typeof original>) {
        const before = this.state.songChangeCount;
        original.apply(this, args);
        for (let n = before; n < this.state.songChangeCount; n++) events.push({ time: args[0] });
    };
    try {
        const result = run();
        return { result, events };
    } finally {
        prototype.pushFrame = original;
    }
}
