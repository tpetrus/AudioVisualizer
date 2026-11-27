import { useId } from 'react';
import { Switch } from '~/components/ui';
import { setEnhancedGraphics } from '~/features/settings/enhancedGraphicsStore';
import { useCapabilityHint } from '~/features/settings/useCapabilityHint';
import { useEnhancedGraphics } from '~/features/settings/useEnhancedGraphics';
import { ENHANCED_GRAPHICS_STRINGS } from './strings';

export type EnhancedGraphicsStatus = 'loading' | 'ready' | 'error';

export interface EnhancedGraphicsToggleProps {
    // Only the dancer panel passes it; the landing page has no scene to report on.
    status?: EnhancedGraphicsStatus;
    className?: string;
    // Replaces the visible description (the aria-describedby text). Absent: ENHANCED_GRAPHICS_STRINGS.description, so the
    // landing page and the dancer render exactly as before.
    description?: string;
}

export function EnhancedGraphicsToggle({ status, className, description }: EnhancedGraphicsToggleProps) {
    const enhanced = useEnhancedGraphics();
    const capable = useCapabilityHint(!enhanced);
    const descriptionId = useId();

    return (
        <div className={`text-sm text-text ${className ?? ''}`.trim()}>
            <Switch
                label={ENHANCED_GRAPHICS_STRINGS.label}
                checked={enhanced}
                onCheckedChange={setEnhancedGraphics}
                aria-describedby={descriptionId}
            />
            <p id={descriptionId} className="mt-1 text-xs text-text-muted">
                {description ?? ENHANCED_GRAPHICS_STRINGS.description}
            </p>
            {!enhanced && capable && (
                <p className="text-xs text-text-muted">{ENHANCED_GRAPHICS_STRINGS.capabilityHint}</p>
            )}
            <p aria-live="polite" className="text-xs text-text">
                {status ? ENHANCED_GRAPHICS_STRINGS.status[status] : ''}
            </p>
        </div>
    );
}
