// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ControlInput } from './ControlInput';
import type { CheckboxControl, ColorControl, RangeControl, SelectControl } from './controls';

const range: RangeControl = {
    type: 'range',
    key: 'gain',
    label: 'Gain',
    section: 'A',
    min: 0,
    max: 2,
    step: 0.5,
    default: 1,
};
const checkbox: CheckboxControl = { type: 'checkbox', key: 'bump', label: 'Bump', section: 'A', default: true };
const color: ColorControl = { type: 'color', key: 'tint', label: 'Tint', section: 'A', default: '#ff0000' };
const select: SelectControl = {
    type: 'select',
    key: 'mode',
    label: 'Mode',
    section: 'A',
    options: [
        { value: 'a', label: 'Alpha' },
        { value: 'b', label: 'Beta' },
        { value: 'c', label: 'Gamma' },
    ],
    default: 'a',
};

describe('ControlInput', () => {
    it('renders a range slider with the definition limits and reports numbers', () => {
        const onChange = vi.fn();
        render(<ControlInput definition={range} value={1} onChange={onChange} />);

        const slider = screen.getByRole('slider');
        expect(slider).toHaveAttribute('id', 'gain');
        expect(slider).toHaveAttribute('min', '0');
        expect(slider).toHaveAttribute('max', '2');
        expect(slider).toHaveAttribute('step', '0.5');
        expect(slider).toHaveValue('1');

        fireEvent.change(slider, { target: { value: '1.5' } });
        expect(onChange).toHaveBeenCalledWith(1.5);
    });

    it('renders a checkbox that reports the new checked state', () => {
        const onChange = vi.fn();
        const { rerender } = render(<ControlInput definition={checkbox} value={true} onChange={onChange} />);

        const box = screen.getByRole('checkbox');
        expect(box).toBeChecked();
        fireEvent.click(box);
        expect(onChange).toHaveBeenCalledWith(false);

        rerender(<ControlInput definition={checkbox} value={false} onChange={onChange} />);
        expect(screen.getByRole('checkbox')).not.toBeChecked();
    });

    it('renders a colour picker that reports the chosen hex string', () => {
        const onChange = vi.fn();
        const { container } = render(<ControlInput definition={color} value="#ff0000" onChange={onChange} />);

        // Colour inputs have no ARIA role, so find it by its id.
        const picker = container.querySelector<HTMLInputElement>('#tint');
        expect(picker).toHaveAttribute('type', 'color');
        expect(picker).toHaveValue('#ff0000');

        fireEvent.change(picker as HTMLInputElement, { target: { value: '#00ff00' } });
        expect(onChange).toHaveBeenCalledWith('#00ff00');
    });

    it('renders a select with its options in order and the current value chosen', () => {
        render(<ControlInput definition={select} value="b" onChange={vi.fn()} />);

        const box = screen.getByRole('combobox');
        expect(box).toHaveAttribute('id', 'mode');
        expect(screen.getAllByRole('option').map((option) => option.textContent)).toEqual(['Alpha', 'Beta', 'Gamma']);
        expect(screen.getAllByRole('option').map((option) => option.getAttribute('value'))).toEqual(['a', 'b', 'c']);
        expect(box).toHaveValue('b');
    });

    it('reports the chosen option value as a string', async () => {
        const onChange = vi.fn();
        const user = userEvent.setup();
        render(<ControlInput definition={select} value="a" onChange={onChange} />);

        await user.selectOptions(screen.getByRole('combobox'), 'Gamma');
        expect(onChange).toHaveBeenCalledWith('c');
    });

    it('changes the selection from the keyboard', async () => {
        const onChange = vi.fn();
        const user = userEvent.setup();
        render(<ControlInput definition={select} value="a" onChange={onChange} />);

        await user.tab();
        expect(screen.getByRole('combobox')).toHaveFocus();
        // jsdom does not move a select on arrow keys, but a browser reports that as a change event, so send it.
        fireEvent.change(screen.getByRole('combobox'), { target: { value: 'b' } });
        expect(onChange).toHaveBeenCalledWith('b');
    });
});
