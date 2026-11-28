// @vitest-environment jsdom
import { createRef } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Range } from './Range';

describe('Range', () => {
    it('passes min, max, value, handlers and ref to a native range input', () => {
        const onChange = vi.fn();
        const ref = createRef<HTMLInputElement>();
        render(
            <Range
                aria-label="Speed"
                min={0}
                max={10}
                defaultValue={3}
                ref={ref}
                onChange={onChange}
                className="w-full"
            />,
        );
        const range = screen.getByRole('slider', { name: 'Speed' });
        expect(ref.current).toBe(range);
        expect(range).toHaveAttribute('type', 'range');
        expect(range).toHaveAttribute('max', '10');
        expect(range).toHaveClass('accent-accent', 'w-full');
        fireEvent.change(range, { target: { value: '7' } });
        expect(onChange).toHaveBeenCalledOnce();
    });
});
