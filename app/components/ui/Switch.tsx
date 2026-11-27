import type { ReactNode } from 'react';

export interface SwitchProps {
    checked: boolean;
    onCheckedChange: (checked: boolean) => void;
    label: ReactNode;
    disabled?: boolean;
    id?: string;
    'aria-describedby'?: string;
    className?: string;
}

// A button rather than a checkbox because Enter must toggle it too, and a native button gives both Space and Enter.
export function Switch({
    checked,
    onCheckedChange,
    label,
    disabled,
    id,
    'aria-describedby': describedBy,
    className,
}: SwitchProps) {
    return (
        <button
            type="button"
            role="switch"
            id={id}
            aria-checked={checked}
            aria-describedby={describedBy}
            disabled={disabled}
            onClick={() => onCheckedChange(!checked)}
            className={[
                'inline-flex items-center gap-2 rounded-ui border border-border px-2 py-1 text-sm text-text disabled:opacity-50',
                'enabled:hover:border-text-muted',
                className,
            ]
                .filter(Boolean)
                .join(' ')}
        >
            <span
                aria-hidden="true"
                className={`relative inline-block h-4 w-7 shrink-0 rounded-full border transition-colors motion-reduce:transition-none ${
                    checked ? 'border-accent bg-accent' : 'border-border bg-surface-2'
                }`}
            >
                {/* The thumb slides with transform so the animation stays off the layout. */}
                <span
                    className={`absolute top-px left-px size-3 rounded-full bg-text transition-transform motion-reduce:transition-none ${
                        checked ? 'translate-x-3' : 'translate-x-0'
                    }`}
                />
            </span>
            <span>{label}</span>
            {/* Hidden from the accessible name; aria-checked already says the state. */}
            <span aria-hidden="true" className="text-text-muted">
                {checked ? 'On' : 'Off'}
            </span>
        </button>
    );
}
