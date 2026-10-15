import { type ReactNode, useState } from 'react';
import { useAudio } from '../audioEngineContext';
import { outlineButton, primaryButton } from './buttonStyles';
import { StereoMixHelp } from './StereoMixHelp';

interface SourceChooserProps {
    // First use: say what the dialog is for.
    showIntro: boolean;
    // Called once a source has started capturing.
    onStarted: () => void;
    // Only offered when there's a running source to go back to.
    onBack?: () => void;
}

// The two ways to get audio in: share a screen/tab, or open an input device.
export function SourceChooser({ showIntro, onStarted, onBack }: SourceChooserProps) {
    const engine = useAudio();
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
    const [selectedDeviceId, setSelectedDeviceId] = useState('');

    // Runs a capture step with the buttons disabled, showing any failure as a message.
    const run = async (action: () => Promise<void>) => {
        setError('');
        setBusy(true);
        try {
            await action();
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Unable to capture audio.');
        } finally {
            setBusy(false);
        }
    };

    const startScreenCapture = () => run(async () => {
        await engine.startScreenCapture();
        onStarted();
    });

    const loadDevices = () => run(async () => {
        const found = await engine.getInputDevices();
        if (!found.length) {
            throw new Error('No audio input devices were found.');
        }
        const saved = engine.savedSource?.deviceId;
        setDevices(found);
        setSelectedDeviceId(found.find(device => device.deviceId === saved)?.deviceId ?? found[0].deviceId);
    });

    const startDeviceCapture = () => run(async () => {
        await engine.startDeviceCapture(selectedDeviceId);
        onStarted();
    });

    return (
        <>
            {showIntro && <p className="text-sm text-gray-400">Choose where the audio should come from to get started.</p>}

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <SourceCard
                    title="Share screen or tab audio"
                    description={'Nothing to set up. Your browser will ask what to share; enable "Share system audio". '
                        + "You'll need to do this again after a page refresh."}
                >
                    <button type="button" className={primaryButton} disabled={busy} onClick={startScreenCapture}>
                        Share audio
                    </button>
                </SourceCard>

                <SourceCard
                    title="Use an audio input device"
                    description="Pick a microphone, Stereo Mix or a virtual cable that carries your computer's output. Remembered across refreshes."
                >
                    {devices.length === 0 ? (
                        <button type="button" className={outlineButton} disabled={busy} onClick={loadDevices}>
                            Choose device
                        </button>
                    ) : (
                        <>
                            <select
                                className="mb-2 w-full rounded border border-gray-600 bg-neutral-900 px-2 py-1.5 text-gray-100"
                                aria-label="Audio input device"
                                value={selectedDeviceId}
                                onChange={event => setSelectedDeviceId(event.currentTarget.value)}
                            >
                                {devices.map(device => (
                                    <option key={device.deviceId} value={device.deviceId}>
                                        {device.label || 'Unnamed device'}
                                    </option>
                                ))}
                            </select>
                            <button type="button" className={primaryButton} disabled={busy} onClick={startDeviceCapture}>
                                Start
                            </button>
                        </>
                    )}
                </SourceCard>
            </div>

            {error && <div className="mt-2 text-center text-red-500" role="alert">{error}</div>}

            <StereoMixHelp />

            {onBack && (
                <div className="mt-3 text-right">
                    <button type="button" className={outlineButton} onClick={onBack}>Back</button>
                </div>
            )}
        </>
    );
}

interface SourceCardProps {
    title: string;
    description: string;
    children: ReactNode;
}

function SourceCard({ title, description, children }: SourceCardProps) {
    return (
        <div className="flex h-full flex-col rounded border border-white/20 bg-neutral-800 p-4 text-gray-100">
            <h3 className="mb-2 text-base font-medium">{title}</h3>
            <p className="mb-4 flex-grow text-sm text-gray-400">{description}</p>
            {children}
        </div>
    );
}