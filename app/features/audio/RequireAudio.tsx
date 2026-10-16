// Screen capture can't survive a page refresh (the browser requires a click to start it), but an input

import { useEffect, useState, type ReactNode } from "react"
import { useAudio } from "./audioEngineContext";
import { Navigate } from "react-router";

// device can be reopened silently. If neither works, send the user back to the landing page to choose a source.
type Props = { children: ReactNode };
type Status = 'ok' | 'denied' | 'pending';

export default function RequireAudio({ children }: Props) {
    const engine = useAudio();
    // Already capturing (e.g. arriving from the landing page): show the page straight away.
    const [status, setStatus] = useState<Status>(() => engine.getIsCapturing() ? 'ok' : 'pending')

    useEffect(() => {
        if (status !== 'pending') return;
        let cancelled = false;
        engine.resumeSavedSource()
            .then((isRunning) => {
                if (!cancelled) {
                    setStatus(isRunning ? 'ok' : 'denied')
                }
            })
            .catch(() => {
                if (!cancelled) {
                    setStatus('denied');
                }
            });

        return () => { cancelled = true };
    }, [engine])

    if (status === 'denied') return <Navigate to='/' replace></Navigate>;
    if (status === 'pending') return;
    return <>{children}</>
}