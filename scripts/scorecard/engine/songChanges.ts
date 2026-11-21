// A song change with the time of the analyzed frame that raised it. The replay records one per rise of the analyzer's
// songChangeCount (ReplayResult.songChanges).
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
