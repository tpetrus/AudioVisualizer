import { useEffect, type ReactNode } from 'react';
import { useAudio } from '~/features/audio/audioEngineContext';
import { rhythmTracker, type RhythmTracker } from './rhythmTracker';
import { RhythmTrackerContext } from './rhythmTrackerContext';

type Props = { children: ReactNode, tracker?: RhythmTracker };

// Provides the app-wide rhythm tracker and runs it for as long as the app is mounted, so its tempo lock survives
// navigating between visualizers. Must sit inside <AudioProvider>.
export function RhythmProvider({ children, tracker = rhythmTracker }: Props) {
    const engine = useAudio();

    useEffect(() => {
        tracker.start(engine);
        return () => tracker.dispose();
    }, [tracker, engine]);

    return <RhythmTrackerContext.Provider value={tracker}>
        {children}
    </RhythmTrackerContext.Provider>
}
