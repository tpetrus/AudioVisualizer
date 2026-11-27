import { useCallback, useState } from 'react';
import { Button, Dialog } from '~/components/ui';
import { useCapturing } from '../useAudioState';
import { SourceChooser } from './SourceChooser';
import { ActiveSourcePanel } from './ActiveSourcePanel';

interface AudioSourceDialogProps {
    onClose: () => void;
    // Optional dialogs can be closed even with no source. Required ones (the default) can't be until one is capturing.
    dismissible?: boolean;
    // Offers a way out of a required dialog that has no source yet. Never shown while capturing or when dismissible.
    onBackHome?: () => void;
}

// Modal for choosing the audio source. Whether it shows the chooser or the active source depends on capturing alone.
export function AudioSourceDialog({ onClose, dismissible = false, onBackHome }: AudioSourceDialogProps) {
    const capturing = useCapturing();
    const canClose = dismissible || capturing;
    const [showChooser, setShowChooser] = useState(false);

    // Dialog only calls this while closable; the guard also keeps the panel's Done button safe.
    const close = useCallback(() => {
        if (canClose) {
            onClose();
        }
    }, [canClose, onClose]);

    const choosing = !capturing || showChooser;
    const showBackHome = onBackHome !== undefined && !dismissible && !capturing;

    return (
        <Dialog title="Audio source" closable={canClose} onClose={close}>
            {choosing ? (
                <SourceChooser
                    showIntro={!capturing}
                    onStarted={() => setShowChooser(false)}
                    onBack={capturing ? () => setShowChooser(false) : undefined}
                />
            ) : (
                <ActiveSourcePanel onChooseSource={() => setShowChooser(true)} onDone={close} />
            )}

            {showBackHome && (
                <div className="mt-3 text-right">
                    <Button variant="secondary" onClick={onBackHome}>
                        Back to home
                    </Button>
                </div>
            )}
        </Dialog>
    );
}
