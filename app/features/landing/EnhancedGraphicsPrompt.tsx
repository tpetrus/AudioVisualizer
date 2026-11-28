import { useEffect, useRef, useState } from 'react';
import { Button, Dialog } from '~/components/ui';
import { setEnhancedGraphics } from '~/features/settings/enhancedGraphicsStore';
import {
    markEnhancedGraphicsPromptSeen,
    shouldShowEnhancedGraphicsPrompt,
} from '~/features/settings/enhancedGraphicsPromptStore';
import { useCapabilityHint } from '~/features/settings/useCapabilityHint';

export interface EnhancedGraphicsPromptProps {
    // True while another dialog is open. The prompt never opens over it; one already open stays as it is.
    blocked: boolean;
}

// Offers the enhanced look once, on the first visit, and only on a device whose probe passed.
export function EnhancedGraphicsPrompt({ blocked }: EnhancedGraphicsPromptProps) {
    // Read in an effect, never during render, so prerendering and the first paint do not depend on storage.
    const [eligible, setEligible] = useState(false);
    // Once closed it stays closed for the page session, even if the blocking dialog goes away later.
    const [dismissed, setDismissed] = useState(false);
    const [open, setOpen] = useState(false);
    const turnOnRef = useRef<HTMLButtonElement>(null);
    const capable = useCapabilityHint(eligible);

    // Storage is read after mount, in a microtask, so neither the render nor the first paint depends on it.
    useEffect(() => {
        let active = true;
        void Promise.resolve().then(() => {
            if (active) {
                setEligible(shouldShowEnhancedGraphicsPrompt());
            }
        });
        return () => {
            active = false;
        };
    }, []);

    // Latches open, so a dialog that opens later does not take the prompt away; `blocked` only gates the opening.
    // Adjusting state during render (React's pattern for state derived from props) avoids an extra effect pass.
    // Storage is checked again at this moment because the idle probe, or a blocking dialog, can hold the opening back
    // long after mount: the visitor may have flipped the switch meanwhile, or another tab may have answered.
    if (!open && capable && !blocked && !dismissed) {
        if (shouldShowEnhancedGraphicsPrompt()) {
            setOpen(true);
        } else {
            setDismissed(true);
        }
    }

    // The dialog focuses itself on mount; this moves focus on to the primary action.
    useEffect(() => {
        if (open) {
            turnOnRef.current?.focus();
        }
    }, [open]);

    if (!open) {
        return null;
    }

    const close = () => {
        markEnhancedGraphicsPromptSeen();
        setDismissed(true);
        setOpen(false);
    };

    return (
        <Dialog title="Turn on enhanced graphics?" onClose={close} className="max-w-md">
            <p className="text-sm text-text-muted">
                Richer lighting, glow and depth in the visualizers. Needs a strong GPU, and the dancing character
                downloads up to about 30 MB. You can change this any time in Graphics settings.
            </p>
            <div className="mt-4 flex justify-end gap-2">
                <Button variant="secondary" onClick={close}>
                    Not now
                </Button>
                <Button
                    ref={turnOnRef}
                    variant="primary"
                    onClick={() => {
                        setEnhancedGraphics(true);
                        close();
                    }}
                >
                    Turn on
                </Button>
            </div>
        </Dialog>
    );
}
