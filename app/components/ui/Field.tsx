import type { ReactNode } from 'react';

export interface FieldProps {
    label: ReactNode;
    htmlFor: string;
    hint?: ReactNode;
    children: ReactNode;
    className?: string;
}

export function Field({ label, htmlFor, hint, children, className }: FieldProps) {
    return (
        <div className={['flex flex-col gap-1', className].filter(Boolean).join(' ')}>
            <label htmlFor={htmlFor} className="text-sm text-text">
                {label}
            </label>
            {children}
            {hint && <p className="text-xs text-text-muted">{hint}</p>}
        </div>
    );
}
