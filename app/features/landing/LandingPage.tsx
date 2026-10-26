import { useEffect, useState } from 'react';
import { useAudio } from '../audio/audioEngineContext';
import { useCapturing } from '../audio/useAudioState';
import { TitleBanner } from './TitleBanner';
import { ComingSoonCard } from './ComingSoonCard';
import { VisualizationCard } from './VisualizationCard';
import { AudioSourceDialog } from '../audio/components/AudioSourceDialog';
import { VISUALIZATIONS } from './visualizations';
import { version } from '../../../package.json';

export function LandingPage() {
    const engine = useAudio();
    const capturing = useCapturing();
    const [dialogOpen, setDialogOpen] = useState(false);

    // A remembered input device reopens silently so the status below is accurate after a refresh. Nothing is shown
    // on failure: the user can connect a source from here or when they open a visualization.
    useEffect(() => {
        engine.resumeSavedSource().catch(() => {});
    }, [engine]);

    return (
        <main className="min-h-screen overflow-x-hidden overflow-y-auto bg-[rgb(10,10,10)]">
            {dialogOpen && <AudioSourceDialog dismissible onClose={() => setDialogOpen(false)} />}
            <span data-testid="app-version" className="text-xs text-gray-400 pl-3">
                v{version}
            </span>
            <TitleBanner priority />

            <div className="py-1 text-center text-sm text-white">
                {capturing && 'Audio source active · '}
                <button type="button" className="text-gray-400 hover:text-white" onClick={() => setDialogOpen(true)}>
                    {capturing ? 'Audio settings' : 'Connect audio'}
                </button>
            </div>

            <div className="grid grid-cols-3">
                {VISUALIZATIONS.map((visualization) => (
                    <VisualizationCard key={visualization.to} {...visualization} />
                ))}
                <ComingSoonCard />
            </div>
        </main>
    );
}
