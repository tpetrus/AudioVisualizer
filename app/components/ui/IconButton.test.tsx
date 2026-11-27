// @vitest-environment jsdom
import { createRef } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { IconButton } from './IconButton';

describe('IconButton', () => {
    it('is a square ghost button named by aria-label, of type button', () => {
        render(<IconButton aria-label="Lock">L</IconButton>);
        const button = screen.getByRole('button', { name: 'Lock' });
        expect(button).toHaveAttribute('type', 'button');
        expect(button).toHaveClass('size-8', 'bg-transparent');
    });

    it('supports the sm size, variants, type and className', () => {
        render(
            <IconButton aria-label="Reset" size="sm" variant="primary" type="submit" className="ml-1">
                R
            </IconButton>,
        );
        const button = screen.getByRole('button', { name: 'Reset' });
        expect(button).toHaveClass('size-6', 'bg-accent', 'ml-1');
        expect(button).toHaveAttribute('type', 'submit');
    });

    it('forwards its ref and clicks', async () => {
        const ref = createRef<HTMLButtonElement>();
        const onClick = vi.fn();
        render(
            <IconButton aria-label="Full" ref={ref} onClick={onClick}>
                F
            </IconButton>,
        );
        expect(ref.current).toBe(screen.getByRole('button', { name: 'Full' }));
        await userEvent.click(screen.getByRole('button', { name: 'Full' }));
        expect(onClick).toHaveBeenCalledOnce();
    });

    it('does not fire while disabled', async () => {
        const onClick = vi.fn();
        render(
            <IconButton aria-label="Off" disabled onClick={onClick}>
                x
            </IconButton>,
        );
        await userEvent.click(screen.getByRole('button', { name: 'Off' }));
        expect(onClick).not.toHaveBeenCalled();
    });
});
