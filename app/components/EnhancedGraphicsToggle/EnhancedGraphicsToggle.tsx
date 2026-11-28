import { useId } from 'react';
import { Badge, Section, Switch } from '~/components/ui';
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
        <Section title={ENHANCED_GRAPHICS_STRINGS.sectionTitle} className={className}>
            {/* Wraps, so in the 340px panel the badge drops under the switch instead of squeezing it. */}
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-text">
                <Switch
                    label={ENHANCED_GRAPHICS_STRINGS.label}
                    checked={enhanced}
                    onCheckedChange={setEnhancedGraphics}
                    aria-describedby={descriptionId}
                />
                {capable && <Badge tone="accent">{ENHANCED_GRAPHICS_STRINGS.recommended}</Badge>}
            </div>
            <p id={descriptionId} className="mt-1 text-xs text-text-muted">
                {description ?? ENHANCED_GRAPHICS_STRINGS.description}
            </p>
            <p aria-live="polite" className="text-xs text-text">
                {status ? ENHANCED_GRAPHICS_STRINGS.status[status] : ''}
            </p>
        </Section>
    );
}
