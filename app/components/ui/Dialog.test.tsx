// @vitest-environment jsdom
import { useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Dialog } from './Dialog';

function Harness({ onClose = () => {}, closable }: { onClose?: () => void; closable?: boolean }) {
    const [open, setOpen] = useState(false);
    return (
        <>
            <button type="button" onClick={() => setOpen(true)}>
                Open
            </button>
            {open && (
                <Dialog
                    title="Settings"
                    closable={closable}
                    onClose={() => {
                        onClose();
                        setOpen(false);
                    }}
                >
                    <button type="button">First</button>
                    <button type="button">Last</button>
                </Dialog>
            )}
        </>
    );
}

describe('Dialog', () => {
    it('is a modal dialog named by its title, focused on mount', () => {
        render(
            <Dialog title="Audio source" onClose={() => {}}>
                body
            </Dialog>,
        );
        const dialog = screen.getByRole('dialog', { name: 'Audio source' });
        expect(dialog).toHaveAttribute('aria-modal', 'true');
        expect(dialog).toHaveFocus();
        expect(dialog).toHaveClass('max-w-[780px]', 'bg-surface-1');
    });

    it('returns focus to the opener on unmount', async () => {
        render(<Harness />);
        await userEvent.click(screen.getByRole('button', { name: 'Open' }));
        expect(screen.getByRole('dialog')).toHaveFocus();
        await userEvent.keyboard('{Escape}');
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Open' })).toHaveFocus();
    });

    it('does not restore focus to an element that left the document', () => {
        const opener = document.createElement('button');
        document.body.append(opener);
        opener.focus();
        const focus = vi.spyOn(opener, 'focus');
        const { unmount } = render(
            <Dialog title="T" onClose={() => {}}>
                x
            </Dialog>,
        );
        opener.remove();
        focus.mockClear();
        unmount();
        expect(focus).not.toHaveBeenCalled();
    });

    it('ignores a non-element previous focus', () => {
        const { unmount } = render(
            <Dialog title="T" onClose={() => {}}>
                x
            </Dialog>,
        );
        unmount();
        expect(document.body).toBeInTheDocument();
    });

    it('wraps Tab from the last control to the first and Shift+Tab back', async () => {
        render(<Harness />);
        await userEvent.click(screen.getByRole('button', { name: 'Open' }));
        const close = screen.getByRole('button', { name: 'Close' });
        const last = screen.getByRole('button', { name: 'Last' });
        last.focus();
        await userEvent.tab();
        expect(close).toHaveFocus();
        await userEvent.tab({ shift: true });
        expect(last).toHaveFocus();
    });

    it('moves Shift+Tab from the dialog itself to the last control', async () => {
        render(<Harness />);
        await userEvent.click(screen.getByRole('button', { name: 'Open' }));
        await userEvent.tab({ shift: true });
        expect(screen.getByRole('button', { name: 'Last' })).toHaveFocus();
    });

    it('lets Tab move normally between inner controls', async () => {
        render(<Harness />);
        await userEvent.click(screen.getByRole('button', { name: 'Open' }));
        screen.getByRole('button', { name: 'Close' }).focus();
        await userEvent.tab();
        expect(screen.getByRole('button', { name: 'First' })).toHaveFocus();
    });

    it('keeps focus on the dialog when nothing inside is focusable', async () => {
        render(
            <Dialog title="T" closable={false} onClose={() => {}}>
                text only
            </Dialog>,
        );
        await userEvent.tab();
        expect(screen.getByRole('dialog')).toHaveFocus();
    });

    it('ignores keys other than Tab and Escape', async () => {
        const onClose = vi.fn();
        render(
            <Dialog title="T" onClose={onClose}>
                x
            </Dialog>,
        );
        await userEvent.keyboard('a');
        expect(onClose).not.toHaveBeenCalled();
    });

    it('closes on Escape, the backdrop and the Close button when closable', async () => {
        const onClose = vi.fn();
        render(
            <Dialog title="T" onClose={onClose}>
                <p>inside</p>
            </Dialog>,
        );
        await userEvent.keyboard('{Escape}');
        expect(onClose).toHaveBeenCalledTimes(1);
        await userEvent.click(screen.getByRole('dialog').parentElement as HTMLElement);
        expect(onClose).toHaveBeenCalledTimes(2);
        await userEvent.click(screen.getByText('inside'));
        expect(onClose).toHaveBeenCalledTimes(2);
        await userEvent.click(screen.getByRole('button', { name: 'Close' }));
        expect(onClose).toHaveBeenCalledTimes(3);
    });

    it('ignores Escape and the backdrop and hides Close when not closable', async () => {
        const onClose = vi.fn();
        render(
            <Dialog title="T" closable={false} onClose={onClose}>
                x
            </Dialog>,
        );
        await userEvent.keyboard('{Escape}');
        await userEvent.click(screen.getByRole('dialog').parentElement as HTMLElement);
        expect(onClose).not.toHaveBeenCalled();
        expect(screen.queryByRole('button', { name: 'Close' })).not.toBeInTheDocument();
    });

    it('appends className to the panel', () => {
        render(
            <Dialog title="T" onClose={() => {}} className="max-w-sm">
                x
            </Dialog>,
        );
        expect(screen.getByRole('dialog').className.endsWith('max-w-sm')).toBe(true);
    });

    it('lets a caller width replace the default width instead of competing with it', () => {
        render(
            <Dialog title="T" onClose={() => {}} className="max-w-sm">
                x
            </Dialog>,
        );
        expect(screen.getByRole('dialog')).not.toHaveClass('max-w-[780px]');
    });

    it('wraps Tab to a trailing summary and skips controls inside a closed details or a hidden subtree', async () => {
        render(
            <Dialog title="T" onClose={() => {}}>
                <button type="button">First</button>
                <div hidden>
                    <button type="button">Hidden</button>
                </div>
                <details>
                    <summary>Help</summary>
                    <button type="button">Inside closed details</button>
                </details>
            </Dialog>,
        );
        const close = screen.getByRole('button', { name: 'Close' });
        const summary = screen.getByText('Help');
        summary.focus();
        await userEvent.tab();
        expect(close).toHaveFocus();
        close.focus();
        await userEvent.tab({ shift: true });
        expect(summary).toHaveFocus();
    });
});
