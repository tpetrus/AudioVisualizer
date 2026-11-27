// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Checkbox } from './Checkbox';

describe('Checkbox', () => {
    it('is a checkbox named by its label and reflects checked', () => {
        render(<Checkbox checked onCheckedChange={() => {}} label="Show performance stats" id="stats" />);
        const box = screen.getByRole('checkbox', { name: 'Show performance stats' });
        expect(box).toBeChecked();
        expect(box).toHaveAttribute('id', 'stats');
    });

    it('reports the new value on change', async () => {
        const onCheckedChange = vi.fn();
        render(<Checkbox checked={false} onCheckedChange={onCheckedChange} label="Stats" />);
        await userEvent.click(screen.getByRole('checkbox', { name: 'Stats' }));
        expect(onCheckedChange).toHaveBeenCalledWith(true);
    });

    it('is inert and dimmed while disabled', async () => {
        const onCheckedChange = vi.fn();
        render(<Checkbox checked={false} onCheckedChange={onCheckedChange} label="Stats" disabled className="mt-1" />);
        const box = screen.getByRole('checkbox', { name: 'Stats' });
        await userEvent.click(box);
        expect(box).toBeDisabled();
        expect(onCheckedChange).not.toHaveBeenCalled();
        expect(box.closest('label')).toHaveClass('opacity-50', 'mt-1');
    });
});
