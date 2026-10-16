import { useSyncExternalStore } from 'react';
import { useRhythm } from './rhythmTrackerContext';
import type { BeatsPerBar } from './types';

// Re-renders when the detected meter changes (3, 4, or undefined while unsure). Per-frame values such as the beat
// phase are deliberately not available here: read `tracker.state` in the render loop instead.
export function useBeatsPerBar(): BeatsPerBar | undefined {
    const tracker = useRhythm();
    return useSyncExternalStore(tracker.subscribe, tracker.getBeatsPerBar, tracker.getBeatsPerBar);
}

// Re-renders each time a song or section change is detected; the number only ever increases.
export function useSongChangeCount(): number {
    const tracker = useRhythm();
    return useSyncExternalStore(tracker.subscribe, tracker.getSongChangeCount, tracker.getSongChangeCount);
}
