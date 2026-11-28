import { useEffect, useState } from 'react';
import { useAudio } from '../audio/audioEngineContext';
import { useCapturing } from '../audio/useAudioState';
import { TitleBanner } from './TitleBanner';
import { ComingSoonCard } from './ComingSoonCard';
import { EnhancedGraphicsToggle } from '~/components/EnhancedGraphicsToggle/EnhancedGraphicsToggle';
import { Button } from '~/components/ui';
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
        <main className="min-h-screen overflow-x-hidden overflow-y-auto bg-surface-0">
            {dialogOpen && <AudioSourceDialog dismissible onClose={() => setDialogOpen(false)} />}
            <span data-testid="app-version" className="pl-3 text-xs text-text-muted">
                v{version}
            </span>
            <TitleBanner priority />

            <div className="py-1 text-center text-sm text-text">
                {capturing && 'Audio source active · '}
                <Button variant="ghost" size="sm" onClick={() => setDialogOpen(true)}>
                    {capturing ? 'Audio settings' : 'Connect audio'}
                </Button>
            </div>
            <EnhancedGraphicsToggle className="flex flex-col items-center px-2 pb-2 text-center" />

            {/* One column below sm and two from sm up, so an even number of cards makes full rows; the coming-soon
                strip sits under the grid instead of in it. */}
            <div className="grid grid-cols-1 gap-2 p-2 sm:grid-cols-2">
                {VISUALIZATIONS.map((visualization) => (
                    <VisualizationCard key={visualization.to} {...visualization} />
                ))}
            </div>
            <div className="px-2 pb-2">
                <ComingSoonCard />
            </div>
        </main>
    );
}
