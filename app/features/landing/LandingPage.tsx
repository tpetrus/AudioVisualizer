import { useEffect, useState } from 'react';
import { useAudio } from '../audio/audioEngineContext';
import { useCapturing } from '../audio/useAudioState';
import { TitleBanner } from './TitleBanner';
import { ComingSoonCard } from './ComingSoonCard';
import { VisualizationCard } from './VisualizationCard';

const VISUALIZATIONS = [
    { to: '/cubes', title: 'Cubes', image: '/images/cubes.png' },
    { to: '/basic-color-wave', title: 'Basic color wave', image: '/images/basic-color-wave.png' },
];

export function LandingPage() {
    const engine = useAudio();
    const capturing = useCapturing();
    const [dialogOpen, setDialogOpen] = useState(false);

    // A remembered input device reopens silently; otherwise the audio dialog must be completed first.
    useEffect(() => {
        let cancelled = false;
        engine.resumeSavedSource()
            .then(resumed => {
                if (!cancelled && !resumed) {
                    setDialogOpen(true);
                }
            })
            .catch(() => {
                if (!cancelled) {
                    setDialogOpen(true);
                }
            });
        return () => {
            cancelled = true;
        };
    }, [engine]);

    return (
        <main className="min-h-screen overflow-x-hidden overflow-y-auto bg-[rgb(10,10,10)]">
            {/* TODO: Add back after 6b*/}
            {/* {dialogOpen && <AudioSourceDialog onClose={() => setDialogOpen(false)} />} */}

            <TitleBanner />

            {capturing && (
                <div className="py-1 text-center text-sm text-white">
                    Audio source active ·{' '}
                    <button type="button" className="text-gray-600 hover:text-gray-400" onClick={() => setDialogOpen(true)}>
                        Audio settings
                    </button>
                </div>
            )}

            <div className="grid grid-cols-3">
                {VISUALIZATIONS.map(visualization => (
                    <VisualizationCard key={visualization.to} {...visualization} disabled={!capturing} />
                ))}
                <ComingSoonCard />
            </div>
        </main>
    );
}