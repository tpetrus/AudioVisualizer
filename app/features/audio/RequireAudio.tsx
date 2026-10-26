import { useEffect, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router';
import { useAudio } from './audioEngineContext';
import { useCapturing } from './useAudioState';
import { AudioSourceDialog } from './components/AudioSourceDialog';

type Props = { children: ReactNode };
type Status = 'ok' | 'denied' | 'pending';

// Screen capture can't survive a page refresh (the browser requires a click to start it), but an input
// device can be reopened silently. If neither works, ask for a source in a required dialog over the page,
// which the user can leave only by starting a source or going back to the landing page.
export function RequireAudio({ children }: Props) {
    const engine = useAudio();
    const navigate = useNavigate();
    // Already capturing (e.g. arriving from the landing page): show the page straight away.
    const [status, setStatus] = useState<Status>(() => (engine.getIsCapturing() ? 'ok' : 'pending'));
    const [promptOpen, setPromptOpen] = useState(false);

    useEffect(() => {
        if (status !== 'pending') return;
        let cancelled = false;
        const deny = () => {
            if (!cancelled) {
                setStatus('denied');
                setPromptOpen(true);
            }
        };
        engine
            .resumeSavedSource()
            .then((isRunning) => {
                if (cancelled) return;
                if (isRunning) {
                    setStatus('ok');
                } else {
                    deny();
                }
            })
            .catch(deny);

        return () => {
            cancelled = true;
        };
    }, [engine, status]);

    if (status === 'pending') return null;

    return (
        <>
            {status === 'ok' ? children : <FirstCaptureWatcher onCapturing={() => setStatus('ok')} />}
            {promptOpen && (
                <AudioSourceDialog
                    onClose={() => setPromptOpen(false)}
                    // "Back to home" only makes sense while waiting for the first source. Once the page is shown, a
                    // source switch briefly isn't capturing, and the open dialog must not flip into required mode.
                    onBackHome={status === 'ok' ? undefined : () => navigate('/')}
                />
            )}
        </>
    );
}

// Reports the first time a source is capturing, then goes away (the guard switches to 'ok' and unmounts it).
// The guard may only watch capture state while it is waiting for a source: once the page is shown, a source switch
// (stop, then start the new one) briefly isn't capturing and must not unmount the visualizer or ask again.
function FirstCaptureWatcher({ onCapturing }: { onCapturing: () => void }) {
    const capturing = useCapturing();

    useEffect(() => {
        if (capturing) {
            onCapturing();
        }
    }, [capturing, onCapturing]);

    return null;
}
