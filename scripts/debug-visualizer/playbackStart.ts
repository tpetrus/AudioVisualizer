export interface PlaybackStart {
    // Feeds one polled position and says whether the wanted playback has started.
    observe(position: number): boolean;
}

// Decides when a polled playback position means the wanted playback has started. The first play accepts any position.
// A re-selected play keeps the old playback running (or holding at its end) until the new file decodes, so the position
// alone cannot tell them apart: it counts as started when it is back below `min(restartedFrom, withinSeconds)`, or when
// it is lower than the previous poll, because only a new playback replacing the old one makes the position go backward.
// The second clause is what works when the old play ended at or near 0, where the first one can never hold.
export function createPlaybackStart(restartedFrom: number | undefined, withinSeconds: number): PlaybackStart {
    let previous = -Infinity;
    return {
        observe(position) {
            const last = previous;
            previous = position;
            if (restartedFrom === undefined) return true;
            return position < Math.min(restartedFrom, withinSeconds) || position < last;
        },
    };
}
