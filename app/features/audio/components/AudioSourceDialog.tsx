import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { useCapturing } from '../useAudioState';
import { SourceChooser } from './SourceChooser';
import { ActiveSourcePanel } from './ActiveSourcePanel';

interface AudioSourceDialogProps {
    onClose: () => void;
}

// Modal for choosing the audio source. It can't be dismissed until a source is capturing.
export function AudioSourceDialog({ onClose }: AudioSourceDialogProps) {
    const canClose = useCapturing();
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

    const choosing = !canClose || showChooser;

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
                        showIntro={!canClose}
                        onStarted={() => setShowChooser(false)}
                        onBack={canClose ? () => setShowChooser(false) : undefined}
                    />
                ) : (
                    <ActiveSourcePanel onChooseSource={() => setShowChooser(true)} onDone={close} />
                )}
            </div>
        </div>
    );
}
