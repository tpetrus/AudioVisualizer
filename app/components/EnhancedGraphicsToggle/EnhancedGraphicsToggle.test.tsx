// @vitest-environment jsdom
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ENHANCED_GRAPHICS_KEY } from '~/features/settings/enhancedGraphicsStore';
import { EnhancedGraphicsToggle } from './EnhancedGraphicsToggle';
import { ENHANCED_GRAPHICS_STRINGS } from './strings';

// The hint's capability result is decided here; the probe itself is specced in capability.test.ts.
const hint = { current: false };
vi.mock('~/features/settings/useCapabilityHint', () => ({ useCapabilityHint: () => hint.current }));

afterEach(() => {
    localStorage.clear();
    hint.current = false;
});

describe('EnhancedGraphicsToggle', () => {
    it('is a switch named Enhanced graphics, off by default, described by the explanation', () => {
        render(<EnhancedGraphicsToggle />);
        const toggle = screen.getByRole('switch', { name: 'Enhanced graphics' });

        expect(toggle).toHaveAttribute('aria-checked', 'false');
        expect(toggle).toHaveTextContent('Off');
        expect(toggle).toHaveAccessibleDescription(ENHANCED_GRAPHICS_STRINGS.description);
    });

    it('flips and persists with the mouse and with the keyboard', async () => {
        const user = userEvent.setup();
        render(<EnhancedGraphicsToggle />);
        const toggle = screen.getByRole('switch');

        await user.click(toggle);
        expect(toggle).toHaveAttribute('aria-checked', 'true');
        expect(toggle).toHaveTextContent('On');
        expect(screen.getByRole('switch', { name: 'Enhanced graphics' })).toBe(toggle);
        expect(localStorage.getItem(ENHANCED_GRAPHICS_KEY)).toBe('true');

        toggle.focus();
        await user.keyboard('{Enter}');
        expect(toggle).toHaveAttribute('aria-checked', 'false');
        await user.keyboard(' ');
        expect(toggle).toHaveAttribute('aria-checked', 'true');
    });

    it('starts on when the preference is stored on', () => {
        localStorage.setItem(ENHANCED_GRAPHICS_KEY, 'true');
        render(<EnhancedGraphicsToggle />);
        expect(screen.getByRole('switch')).toHaveAttribute('aria-checked', 'true');
    });

    it('keeps two mounted toggles in sync', async () => {
        const user = userEvent.setup();
        render(
            <>
                <EnhancedGraphicsToggle />
                <EnhancedGraphicsToggle />
            </>,
        );
        const [first, second] = screen.getAllByRole('switch');

        await user.click(first);
        expect(second).toHaveAttribute('aria-checked', 'true');
    });

    it('follows a change made in another tab', () => {
        render(<EnhancedGraphicsToggle />);
        localStorage.setItem(ENHANCED_GRAPHICS_KEY, 'true');
        act(() => {
            window.dispatchEvent(new StorageEvent('storage', { key: ENHANCED_GRAPHICS_KEY }));
        });
        expect(screen.getByRole('switch')).toHaveAttribute('aria-checked', 'true');
    });

    it('shows the capability hint only while off and only when the device passes, and never flips the setting', async () => {
        const user = userEvent.setup();
        const { rerender } = render(<EnhancedGraphicsToggle />);
        expect(screen.queryByText(ENHANCED_GRAPHICS_STRINGS.capabilityHint)).not.toBeInTheDocument();

        hint.current = true;
        rerender(<EnhancedGraphicsToggle />);
        expect(screen.getByText(ENHANCED_GRAPHICS_STRINGS.capabilityHint)).toBeInTheDocument();
        expect(screen.getByRole('switch')).toHaveAttribute('aria-checked', 'false');
        expect(localStorage.getItem(ENHANCED_GRAPHICS_KEY)).toBeNull();

        await user.click(screen.getByRole('switch'));
        expect(screen.queryByText(ENHANCED_GRAPHICS_STRINGS.capabilityHint)).not.toBeInTheDocument();
    });

    it('has an empty polite status line without a status', () => {
        render(<EnhancedGraphicsToggle />);
        const live = document.querySelector('[aria-live="polite"]');
        expect(live).toBeEmptyDOMElement();
    });

    it.each([
        ['loading', 'Loading enhanced assets'],
        ['ready', 'Enhanced graphics on'],
        ['error', 'Could not load enhanced assets, using standard'],
    ] as const)('announces the %s status', (status, text) => {
        render(<EnhancedGraphicsToggle status={status} />);
        expect(document.querySelector('[aria-live="polite"]')).toHaveTextContent(text);
    });

    it('passes a class name to the wrapper', () => {
        const { container } = render(<EnhancedGraphicsToggle className="extra" />);
        expect(container.firstElementChild).toHaveClass('extra');
    });
});
