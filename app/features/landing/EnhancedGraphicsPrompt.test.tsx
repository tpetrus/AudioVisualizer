// @vitest-environment jsdom
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ENHANCED_GRAPHICS_KEY } from '~/features/settings/enhancedGraphicsStore';
import { ENHANCED_GRAPHICS_PROMPT_SEEN_KEY } from '~/features/settings/enhancedGraphicsPromptStore';
import { EnhancedGraphicsPrompt } from './EnhancedGraphicsPrompt';

// The probe is specced in capability.test.ts; here the hint is a switch the spec flips. It is only true when asked
// for (enabled), as the real hook is.
const probe = { passes: true };
vi.mock('~/features/settings/useCapabilityHint', () => ({
    useCapabilityHint: (enabled: boolean) => enabled && probe.passes,
}));

afterEach(() => {
    localStorage.clear();
    probe.passes = true;
    vi.restoreAllMocks();
});

const dialog = () => screen.queryByRole('dialog', { name: 'Turn on enhanced graphics?' });

describe('EnhancedGraphicsPrompt', () => {
    it('opens on a capable, unseen first visit with Turn on focused', async () => {
        render(<EnhancedGraphicsPrompt blocked={false} />);

        expect(await screen.findByRole('dialog', { name: 'Turn on enhanced graphics?' })).toBeInTheDocument();
        expect(screen.getByText(/Richer lighting, glow and depth in the visualizers/)).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Turn on' })).toHaveFocus();
    });

    it('does not open when a value is stored after mount but before the probe passes', async () => {
        probe.passes = false;
        const { rerender } = render(<EnhancedGraphicsPrompt blocked={false} />);
        // Let the mount-time storage read run while nothing is stored yet.
        await act(async () => {});
        localStorage.setItem(ENHANCED_GRAPHICS_KEY, 'false');

        probe.passes = true;
        rerender(<EnhancedGraphicsPrompt blocked={false} />);

        expect(dialog()).not.toBeInTheDocument();
        expect(localStorage.getItem(ENHANCED_GRAPHICS_PROMPT_SEEN_KEY)).toBeNull();
    });

    it('Turn on enables the setting, writes the flag and closes for good', async () => {
        const user = userEvent.setup();
        const { rerender } = render(<EnhancedGraphicsPrompt blocked={false} />);

        await user.click(await screen.findByRole('button', { name: 'Turn on' }));

        expect(localStorage.getItem(ENHANCED_GRAPHICS_KEY)).toBe('true');
        expect(localStorage.getItem(ENHANCED_GRAPHICS_PROMPT_SEEN_KEY)).toBe('1');
        expect(dialog()).not.toBeInTheDocument();

        rerender(<EnhancedGraphicsPrompt blocked />);
        rerender(<EnhancedGraphicsPrompt blocked={false} />);
        expect(dialog()).not.toBeInTheDocument();
    });

    it('Not now leaves the setting alone and writes the flag', async () => {
        const user = userEvent.setup();
        render(<EnhancedGraphicsPrompt blocked={false} />);

        await user.click(await screen.findByRole('button', { name: 'Not now' }));

        expect(localStorage.getItem(ENHANCED_GRAPHICS_KEY)).toBeNull();
        expect(localStorage.getItem(ENHANCED_GRAPHICS_PROMPT_SEEN_KEY)).toBe('1');
        expect(dialog()).not.toBeInTheDocument();
    });

    it('Escape leaves the setting alone and writes the flag', async () => {
        const user = userEvent.setup();
        render(<EnhancedGraphicsPrompt blocked={false} />);
        await screen.findByRole('dialog');

        await user.keyboard('{Escape}');

        expect(localStorage.getItem(ENHANCED_GRAPHICS_KEY)).toBeNull();
        expect(localStorage.getItem(ENHANCED_GRAPHICS_PROMPT_SEEN_KEY)).toBe('1');
        expect(dialog()).not.toBeInTheDocument();
    });

    it('stays closed when the device does not pass the probe', () => {
        probe.passes = false;
        render(<EnhancedGraphicsPrompt blocked={false} />);
        expect(dialog()).not.toBeInTheDocument();
    });

    it.each(['true', 'false'])('stays closed when the preference is already stored as %s', (value) => {
        localStorage.setItem(ENHANCED_GRAPHICS_KEY, value);
        render(<EnhancedGraphicsPrompt blocked={false} />);
        expect(dialog()).not.toBeInTheDocument();
    });

    it('stays closed when it was seen before', () => {
        localStorage.setItem(ENHANCED_GRAPHICS_PROMPT_SEEN_KEY, '1');
        render(<EnhancedGraphicsPrompt blocked={false} />);
        expect(dialog()).not.toBeInTheDocument();
    });

    it('stays closed when storage throws', () => {
        vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
            throw new Error('blocked');
        });
        render(<EnhancedGraphicsPrompt blocked={false} />);
        expect(dialog()).not.toBeInTheDocument();
    });

    it('does not open while another dialog is open, then opens once it is gone', async () => {
        const { rerender } = render(<EnhancedGraphicsPrompt blocked />);
        expect(dialog()).not.toBeInTheDocument();

        rerender(<EnhancedGraphicsPrompt blocked={false} />);
        expect(await screen.findByRole('dialog', { name: 'Turn on enhanced graphics?' })).toBeInTheDocument();
    });

    it('stays as it is when another dialog opens while it is up', async () => {
        const { rerender } = render(<EnhancedGraphicsPrompt blocked={false} />);
        await screen.findByRole('dialog');

        rerender(<EnhancedGraphicsPrompt blocked />);
        expect(dialog()).toBeInTheDocument();
    });
});
