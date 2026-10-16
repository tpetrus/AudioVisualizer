import { createContext, useContext } from 'react';
import type { RhythmTracker } from './rhythmTracker';

export const RhythmTrackerContext = createContext<RhythmTracker | null>(null);

export function useRhythm(): RhythmTracker {
    const tracker = useContext(RhythmTrackerContext);
    if (tracker === null) throw Error('useRhythm must be used inside <RhythmProvider>');
    return tracker;
}
