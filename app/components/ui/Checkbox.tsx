import type { ReactNode } from 'react';

export interface CheckboxProps {
    checked: boolean;
    onCheckedChange: (checked: boolean) => void;
    label: ReactNode;
    id?: string;
    disabled?: boolean;
    className?: string;
}

// The native input keeps role, keyboard and form behavior; accent-color themes it without a custom box.
export function Checkbox({ checked, onCheckedChange, label, id, disabled, className }: CheckboxProps) {
    return (
        <label
            className={['inline-flex items-center gap-2 text-sm text-text', disabled && 'opacity-50', className]
                .filter(Boolean)
                .join(' ')}
        >
            <input
                type="checkbox"
                id={id}
                checked={checked}
                disabled={disabled}
                onChange={(event) => onCheckedChange(event.target.checked)}
                className="accent-accent"
            />
            <span>{label}</span>
        </label>
    );
}
