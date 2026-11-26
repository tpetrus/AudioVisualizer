// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getEnhancedGraphics, setEnhancedGraphics } from './enhancedGraphicsStore';
import { isSlowNoticeDismissed, resetSlowNoticeDismissed } from './frameRateMonitor';
import { SlowFrameNotice } from './SlowFrameNotice';

describe('SlowFrameNotice', () => {
    beforeEach(() => {
        resetSlowNoticeDismissed();
        localStorage.clear();
        setEnhancedGraphics(true);
    });

    it('is a polite status message that does not take focus', () => {
        render(<SlowFrameNotice onClose={vi.fn()} />);

        expect(screen.getByRole('status')).toHaveTextContent('Enhanced graphics looks slow on this device.');
        expect(document.body).toHaveFocus();
    });

    it('switches to standard and dismisses on accept', async () => {
        const onClose = vi.fn();
        render(<SlowFrameNotice onClose={onClose} />);

        await userEvent.click(screen.getByRole('button', { name: 'Switch to standard' }));

        expect(getEnhancedGraphics()).toBe(false);
        expect(isSlowNoticeDismissed()).toBe(true);
        expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('keeps the preference and dismisses on Dismiss', async () => {
        const onClose = vi.fn();
        render(<SlowFrameNotice onClose={onClose} />);

        await userEvent.click(screen.getByRole('button', { name: 'Dismiss' }));

        expect(getEnhancedGraphics()).toBe(true);
        expect(isSlowNoticeDismissed()).toBe(true);
        expect(onClose).toHaveBeenCalledTimes(1);
    });
});
