import { useEffect, type ReactNode } from 'react';
import { useAudio } from '~/features/audio/audioEngineContext';
import { rhythmTracker, type RhythmTracker } from './rhythmTracker';
import { RhythmTrackerContext } from './rhythmTrackerContext';

// The part of the audio hub module the provider uses. Declared here so the provider never imports the hub statically.
export interface HubModule {
    audioHub: { start(tracker: RhythmTracker): void; dispose(): void };
}
export type HubLoader = () => Promise<HubModule>;

// A dynamic import keeps the hub out of the entry chunk: the first paint does not pay for it, and it is fetched only
// once the user has chosen a source.
const loadAudioHub: HubLoader = () => import('~/features/audio/hub/audioHub');

type Props = { children: ReactNode; tracker?: RhythmTracker; loadHub?: HubLoader };

// Provides the app-wide rhythm tracker and runs it for as long as the app is mounted, so its tempo lock survives
// navigating between visualizers. Must sit inside <AudioProvider>.
//
// It also starts the audio hub (contract C5) the first time the engine has a source, and keeps it attached across
// source changes until the provider unmounts. `loadHub` exists for specs.
export function RhythmProvider({ children, tracker = rhythmTracker, loadHub = loadAudioHub }: Props) {
    const engine = useAudio();

    useEffect(() => {
        tracker.start(engine);
        return () => tracker.dispose();
    }, [tracker, engine]);

    useEffect(() => {
        // Raised by the cleanup: a load that resolves afterwards (StrictMode's first mount, a quick unmount) must not
        // start anything.
        let cancelled = false;
        let loading = false;
        let hub: HubModule['audioHub'] | undefined;
        let unsubscribe: (() => void) | undefined;

        const startWhenSourced = () => {
            if (hub || loading || !engine.getAnalyser()) {
                return;
            }
            loading = true;
            loadHub()
                .then((module) => {
                    if (cancelled) {
                        return;
                    }
                    // Assigned only after start succeeds, so a failed start is retried and never disposed.
                    module.audioHub.start(tracker);
                    hub = module.audioHub;
                    unsubscribe?.();
                    unsubscribe = undefined;
                })
                .catch((error: unknown) => {
                    // Allow another attempt at the next source change.
                    loading = false;
                    console.error('The audio hub could not start', error);
                });
        };

        unsubscribe = engine.subscribe(startWhenSourced);
        startWhenSourced();
        return () => {
            cancelled = true;
            unsubscribe?.();
            hub?.dispose();
        };
    }, [tracker, engine, loadHub]);

    return <RhythmTrackerContext.Provider value={tracker}>{children}</RhythmTrackerContext.Provider>;
}
