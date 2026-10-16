// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { StereoMixHelp } from './StereoMixHelp';

describe('StereoMixHelp', () => {
    it('is collapsed until the user opens the setup guide', async () => {
        const user = userEvent.setup();
        const { container } = render(<StereoMixHelp />);
        const details = container.querySelector('details');
        expect(details).not.toHaveAttribute('open');

        await user.click(screen.getByText('How do I set up Stereo Mix?'));
        expect(details).toHaveAttribute('open');
        expect(screen.getByText(/Show Disabled Devices/)).toBeVisible();
    });

    it('walks through both the Stereo Mix and the Voicemeeter setups', () => {
        render(<StereoMixHelp />);

        expect(screen.getByText(/Stereo Mix is a Windows recording device/)).toBeInTheDocument();
        expect(screen.getByText(/No Stereo Mix, or it stays silent\?/)).toBeInTheDocument();
        expect(screen.getAllByRole('list', { hidden: true })).toHaveLength(3);
    });
});
