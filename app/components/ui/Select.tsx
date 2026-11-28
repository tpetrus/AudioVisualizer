import type { Ref, SelectHTMLAttributes } from 'react';

export type SelectProps = SelectHTMLAttributes<HTMLSelectElement> & { ref?: Ref<HTMLSelectElement> };

// Options get the same colors because some browsers paint the open list from the option, not the select.
export function Select({ className, ref, ...rest }: SelectProps) {
    return (
        <select
            ref={ref}
            className={[
                'rounded-ui border border-border bg-surface-2 px-2 py-1 text-sm text-text disabled:opacity-50 [&_option]:bg-surface-2 [&_option]:text-text',
                className,
            ]
                .filter(Boolean)
                .join(' ')}
            {...rest}
        />
    );
}
