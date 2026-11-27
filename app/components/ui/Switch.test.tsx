// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Switch } from './Switch';

describe('Switch', () => {
    it('is a switch whose accessible name is the label alone', () => {
        render(<Switch checked={false} onCheckedChange={() => {}} label="Enhanced graphics" />);
        const toggle = screen.getByRole('switch', { name: 'Enhanced graphics' });
        expect(toggle).toHaveAttribute('type', 'button');
        expect(toggle).toHaveAttribute('aria-checked', 'false');
        expect(toggle).toHaveTextContent('Off');
    });

    it('shows On when checked', () => {
        render(<Switch checked onCheckedChange={() => {}} label="Enhanced graphics" />);
        const toggle = screen.getByRole('switch', { name: 'Enhanced graphics' });
        expect(toggle).toBeChecked();
        expect(toggle).toHaveTextContent('On');
    });

    it('toggles on click, Space and Enter', async () => {
        const onCheckedChange = vi.fn();
        render(<Switch checked={false} onCheckedChange={onCheckedChange} label="Mode" />);
        const toggle = screen.getByRole('switch', { name: 'Mode' });
        await userEvent.click(toggle);
        toggle.focus();
        await userEvent.keyboard(' ');
        await userEvent.keyboard('{Enter}');
        expect(onCheckedChange).toHaveBeenCalledTimes(3);
        expect(onCheckedChange).toHaveBeenCalledWith(true);
    });

    it('reports false when turned off', async () => {
        const onCheckedChange = vi.fn();
        render(<Switch checked onCheckedChange={onCheckedChange} label="Mode" />);
        await userEvent.click(screen.getByRole('switch', { name: 'Mode' }));
        expect(onCheckedChange).toHaveBeenCalledWith(false);
    });

    it('does not toggle while disabled', async () => {
        const onCheckedChange = vi.fn();
        render(<Switch checked={false} onCheckedChange={onCheckedChange} label="Mode" disabled />);
        await userEvent.click(screen.getByRole('switch', { name: 'Mode' }));
        expect(onCheckedChange).not.toHaveBeenCalled();
    });

    it('passes id, aria-describedby and className through', () => {
        render(
            <Switch
                checked={false}
                onCheckedChange={() => {}}
                label="Mode"
                id="mode"
                aria-describedby="why"
                className="mt-2"
            />,
        );
        const toggle = screen.getByRole('switch', { name: 'Mode' });
        expect(toggle).toHaveAttribute('id', 'mode');
        expect(toggle).toHaveAttribute('aria-describedby', 'why');
        expect(toggle).toHaveClass('mt-2');
    });
});
