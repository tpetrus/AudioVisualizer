// @vitest-environment jsdom
import { createRef } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Select } from './Select';

describe('Select', () => {
    it('passes props, children and ref to a native select', async () => {
        const onChange = vi.fn();
        const ref = createRef<HTMLSelectElement>();
        render(
            <Select aria-label="Mode" ref={ref} onChange={onChange} className="w-full">
                <option value="a">A</option>
                <option value="b">B</option>
            </Select>,
        );
        const select = screen.getByRole('combobox', { name: 'Mode' });
        expect(ref.current).toBe(select);
        expect(select).toHaveClass('bg-surface-2', 'w-full');
        await userEvent.selectOptions(select, 'b');
        expect(onChange).toHaveBeenCalledOnce();
        expect(select).toHaveValue('b');
    });

    it('can be disabled', () => {
        render(<Select aria-label="Mode" disabled />);
        expect(screen.getByRole('combobox', { name: 'Mode' })).toBeDisabled();
    });
});
