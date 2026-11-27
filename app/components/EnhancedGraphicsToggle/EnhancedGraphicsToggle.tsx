import { useId } from 'react';
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
        <div className={`text-sm text-white ${className ?? ''}`.trim()}>
            <button
                type="button"
                role="switch"
                aria-checked={enhanced}
                aria-describedby={descriptionId}
                onClick={() => setEnhancedGraphics(!enhanced)}
                className="inline-flex items-center gap-2 rounded border border-gray-500 px-2 py-1 hover:border-white"
            >
                <span>{ENHANCED_GRAPHICS_STRINGS.label}</span>
                {/* Hidden from the accessible name; aria-checked already says the state. */}
                <span aria-hidden="true" className="text-gray-300">
                    {enhanced ? ENHANCED_GRAPHICS_STRINGS.on : ENHANCED_GRAPHICS_STRINGS.off}
                </span>
            </button>
            <p id={descriptionId} className="mt-1 text-xs text-gray-400">
                {description ?? ENHANCED_GRAPHICS_STRINGS.description}
            </p>
            {!enhanced && capable && (
                <p className="text-xs text-gray-400">{ENHANCED_GRAPHICS_STRINGS.capabilityHint}</p>
            )}
            <p aria-live="polite" className="text-xs text-gray-300">
                {status ? ENHANCED_GRAPHICS_STRINGS.status[status] : ''}
            </p>
        </div>
    );
}
