import { useEffect, useId, useRef } from 'react';
import type { KeyboardEvent, ReactNode } from 'react';
import { IconButton } from './IconButton';

export interface DialogProps {
    title: ReactNode;
    onClose: () => void;
    closable?: boolean;
    children: ReactNode;
    className?: string;
}

const FOCUSABLE =
    'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

// Mounted means open, so callers render it conditionally and there is no open prop.
export function Dialog({ title, onClose, closable = true, children, className }: DialogProps) {
    const titleId = useId();
    const dialogRef = useRef<HTMLDivElement>(null);

    const close = () => {
        if (closable) {
            onClose();
        }
    };

    useEffect(() => {
        const onKeyDown = (event: globalThis.KeyboardEvent) => {
            if (event.key === 'Escape' && closable) {
                onClose();
            }
        };
        document.addEventListener('keydown', onKeyDown);
        return () => document.removeEventListener('keydown', onKeyDown);
    }, [closable, onClose]);

    // Move keyboard focus into the dialog so Tab starts inside it and screen readers announce it, then give it back
    // on unmount. The opener may have been removed meanwhile, so only restore focus to one still in the document.
    useEffect(() => {
        const previous = document.activeElement;
        dialogRef.current?.focus();
        return () => {
            if (previous instanceof HTMLElement && previous.isConnected) {
                previous.focus();
            }
        };
    }, []);

    // The backdrop hides the page but does not stop Tab from leaving, so the first and last controls wrap here.
    const trapTab = (event: KeyboardEvent<HTMLDivElement>) => {
        if (event.key !== 'Tab') {
            return;
        }
        const dialog = event.currentTarget;
        const focusable = Array.from(dialog.querySelectorAll<HTMLElement>(FOCUSABLE));
        if (focusable.length === 0) {
            event.preventDefault();
            return;
        }
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        const active = document.activeElement;
        if (event.shiftKey && (active === first || active === dialog)) {
            event.preventDefault();
            last.focus();
        } else if (!event.shiftKey && active === last) {
            event.preventDefault();
            first.focus();
        }
    };

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
            {/* The key handler only wraps Tab inside the modal; it adds no action a pointer user would miss. */}
            {/* eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions -- focus trap for a modal dialog */}
            <div
                ref={dialogRef}
                role="dialog"
                aria-modal="true"
                aria-labelledby={titleId}
                tabIndex={-1}
                onKeyDown={trapTab}
                className={[
                    'max-h-[90vh] w-full max-w-[780px] overflow-y-auto rounded-ui border border-border bg-surface-1 p-5 text-text outline-none',
                    className,
                ]
                    .filter(Boolean)
                    .join(' ')}
            >
                <div className="mb-3 flex items-start justify-between gap-3">
                    <h2 id={titleId} className="text-xl font-medium">
                        {title}
                    </h2>
                    {closable && (
                        <IconButton aria-label="Close" onClick={close}>
                            ×
                        </IconButton>
                    )}
                </div>
                {children}
            </div>
        </div>
    );
}
