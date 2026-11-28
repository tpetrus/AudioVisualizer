import type { ReactNode } from 'react';

export type BadgeTone = 'accent' | 'neutral' | 'warning';

export interface BadgeProps {
    children: ReactNode;
    tone?: BadgeTone;
    className?: string;
}

const TONE_CLASSES: Record<BadgeTone, string> = {
    accent: 'border-accent text-accent-text',
    neutral: 'border-border text-text-muted',
    warning: 'border-warning text-warning',
};

export function Badge({ children, tone = 'neutral', className }: BadgeProps) {
    return (
        <span
            className={[
                'inline-block rounded-ui border px-1.5 py-0.5 text-xs leading-none',
                TONE_CLASSES[tone],
                className,
            ]
                .filter(Boolean)
                .join(' ')}
        >
            {children}
        </span>
    );
}
