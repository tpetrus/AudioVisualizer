import type { InputHTMLAttributes, Ref } from 'react';

export type RangeProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> & { ref?: Ref<HTMLInputElement> };

export function Range({ className, ref, ...rest }: RangeProps) {
    return (
        <input
            ref={ref}
            type="range"
            className={['accent-accent disabled:opacity-50', className].filter(Boolean).join(' ')}
            {...rest}
        />
    );
}
