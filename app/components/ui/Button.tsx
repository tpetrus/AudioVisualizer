import type { ButtonHTMLAttributes, Ref } from 'react';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost';
export type ButtonSize = 'sm' | 'md';

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
    variant?: ButtonVariant;
    size?: ButtonSize;
    ref?: Ref<HTMLButtonElement>;
};

// Hover styles sit behind enabled: so a disabled button keeps its resting look, as the contract asks.
const VARIANT_CLASSES: Record<ButtonVariant, string> = {
    primary:
        'border border-accent bg-accent text-white enabled:hover:border-accent-hover enabled:hover:bg-accent-hover',
    secondary: 'border border-border bg-surface-2 text-text enabled:hover:border-text-muted',
    ghost: 'border border-transparent bg-transparent text-text-muted enabled:hover:text-text',
};

const SIZE_CLASSES: Record<ButtonSize, string> = {
    sm: 'px-2 py-1 text-xs',
    md: 'px-3 py-1.5 text-sm',
};

// Square sizes for IconButton: the same height as the text sizes, with the width matching it.
const SQUARE_SIZE_CLASSES: Record<ButtonSize, string> = {
    sm: 'size-6 text-sm',
    md: 'size-8 text-base',
};

// Shared with IconButton so both stay on one set of variant colors. Not part of the public index.
export function buttonClasses(variant: ButtonVariant, size: ButtonSize, square: boolean, className?: string): string {
    const sizing = square ? SQUARE_SIZE_CLASSES[size] : SIZE_CLASSES[size];
    return [
        'inline-flex items-center justify-center gap-2 rounded-ui leading-none transition-colors disabled:opacity-50 motion-reduce:transition-none',
        VARIANT_CLASSES[variant],
        sizing,
        className,
    ]
        .filter(Boolean)
        .join(' ');
}

export function Button({ variant = 'secondary', size = 'md', type = 'button', className, ref, ...rest }: ButtonProps) {
    return <button ref={ref} type={type} className={buttonClasses(variant, size, false, className)} {...rest} />;
}
