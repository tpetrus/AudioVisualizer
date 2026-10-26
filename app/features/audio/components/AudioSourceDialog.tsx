import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { useCapturing } from '../useAudioState';
import { SourceChooser } from './SourceChooser';
import { ActiveSourcePanel } from './ActiveSourcePanel';
import { outlineButton } from './buttonStyles';

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
    const titleId = useId();
    const dialogRef = useRef<HTMLDivElement>(null);

    const close = useCallback(() => {
        if (canClose) {
            onClose();
        }
    }, [canClose, onClose]);

    useEffect(() => {
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                close();
            }
        };
        document.addEventListener('keydown', onKeyDown);
        return () => document.removeEventListener('keydown', onKeyDown);
    }, [close]);

    // Move keyboard focus into the dialog so Tab starts inside it and screen readers announce it.
    useEffect(() => {
        dialogRef.current?.focus();
    }, []);

    const choosing = !capturing || showChooser;
    const showBackHome = onBackHome !== undefined && !dismissible && !capturing;

    return (
        // The backdrop click is a mouse convenience only; keyboard users close the dialog with Escape (handled above).
        // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions -- backdrop dismissal has a keyboard equivalent
        <div
            className="fixed inset-0 z-[1050] flex items-center justify-center bg-black/75 p-4"
            onClick={(event) => {
                if (event.target === event.currentTarget) {
                    close();
                }
            }}
        >
            <div
                ref={dialogRef}
                role="dialog"
                aria-modal="true"
                aria-labelledby={titleId}
                tabIndex={-1}
                className="max-h-[90vh] w-full max-w-[780px] overflow-y-auto rounded-lg border border-[#444] bg-neutral-800 p-5 text-gray-100 outline-none"
            >
                <div className="mb-3 flex items-start justify-between">
                    <h2 id={titleId} className="mb-0 text-xl font-medium">
                        Audio source
                    </h2>
                    {canClose && (
                        <button
                            type="button"
                            className="text-2xl leading-none text-white opacity-60 hover:opacity-100"
                            aria-label="Close"
                            onClick={close}
                        >
                            ×
                        </button>
                    )}
                </div>

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
                        <button type="button" className={outlineButton} onClick={onBackHome}>
                            Back to home
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}
