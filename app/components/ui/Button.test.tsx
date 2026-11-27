// @vitest-environment jsdom
import { createRef } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Button } from './Button';

describe('Button', () => {
    it('defaults to a secondary md button of type button', () => {
        render(<Button>Save</Button>);
        const button = screen.getByRole('button', { name: 'Save' });
        expect(button).toHaveAttribute('type', 'button');
        expect(button).toHaveClass('bg-surface-2', 'px-3', 'py-1.5', 'text-sm');
    });

    it('lets the caller choose the type', () => {
        render(<Button type="submit">Go</Button>);
        expect(screen.getByRole('button', { name: 'Go' })).toHaveAttribute('type', 'submit');
    });

    it('styles each variant', () => {
        render(
            <>
                <Button variant="primary">P</Button>
                <Button variant="ghost">G</Button>
            </>,
        );
        expect(screen.getByRole('button', { name: 'P' })).toHaveClass('bg-accent', 'text-white');
        expect(screen.getByRole('button', { name: 'G' })).toHaveClass('bg-transparent', 'text-text-muted');
    });

    it('styles the sm size and appends className last', () => {
        render(
            <Button size="sm" className="ml-2">
                Small
            </Button>,
        );
        const button = screen.getByRole('button', { name: 'Small' });
        expect(button).toHaveClass('px-2', 'py-1', 'text-xs');
        expect(button.className.endsWith('ml-2')).toBe(true);
    });

    it('forwards its ref', () => {
        const ref = createRef<HTMLButtonElement>();
        render(<Button ref={ref}>Ref</Button>);
        expect(ref.current).toBe(screen.getByRole('button', { name: 'Ref' }));
    });

    it('does not fire while disabled', async () => {
        const onClick = vi.fn();
        render(
            <Button disabled onClick={onClick}>
                Off
            </Button>,
        );
        const button = screen.getByRole('button', { name: 'Off' });
        expect(button).toBeDisabled();
        expect(button).toHaveClass('disabled:opacity-50');
        await userEvent.click(button);
        expect(onClick).not.toHaveBeenCalled();
    });
});
