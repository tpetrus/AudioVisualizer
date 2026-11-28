import type { ReactNode } from 'react';

export interface SectionProps {
    title: ReactNode;
    children: ReactNode;
    className?: string;
}

export function Section({ title, children, className }: SectionProps) {
    return (
        <section className={className}>
            <h3 className="mb-2 text-xs font-medium tracking-wide text-text-muted uppercase">{title}</h3>
            {children}
        </section>
    );
}
