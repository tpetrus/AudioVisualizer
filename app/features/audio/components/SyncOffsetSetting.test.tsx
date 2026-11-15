// @vitest-environment jsdom
import { fireEvent, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderWithProviders } from '~/test/renderWithProviders';
import { SyncOffsetSetting } from './SyncOffsetSetting';

describe('SyncOffsetSetting', () => {
    it('has a labelled range input with the contract limits and a neutral reading', () => {
        renderWithProviders(<SyncOffsetSetting />);

        const slider = screen.getByLabelText('Visual timing');
        expect(slider).toHaveAttribute('type', 'range');
        expect(slider).toHaveAttribute('min', '-200');
        expect(slider).toHaveAttribute('max', '200');
        expect(slider).toHaveAttribute('step', '5');
        expect(slider).toHaveValue('0');
        expect(screen.getByText('0 ms')).toBeInTheDocument();
        expect(screen.getByText(/earlier or later to match what you hear/)).toBeInTheDocument();
    });

    it('sends the value as a number to the engine and spells out the direction', () => {
        const { engine } = renderWithProviders(<SyncOffsetSetting />);
        const slider = screen.getByLabelText('Visual timing');

        fireEvent.change(slider, { target: { value: '40' } });
        expect(engine.setSyncOffsetMs).toHaveBeenCalledWith(40);
        expect(screen.getByText('40 ms later')).toBeInTheDocument();
        expect(slider).toHaveAttribute('aria-valuetext', '40 ms later');

        fireEvent.change(slider, { target: { value: '-25' } });
        expect(engine.setSyncOffsetMs).toHaveBeenCalledWith(-25);
        expect(screen.getByText('25 ms earlier')).toBeInTheDocument();
    });

    it('resets to 0 through the engine', async () => {
        const { engine, user } = renderWithProviders(<SyncOffsetSetting />);
        fireEvent.change(screen.getByLabelText('Visual timing'), { target: { value: '40' } });

        await user.click(screen.getByText('Sync'));
        await user.click(screen.getByRole('button', { name: 'Reset' }));

        expect(engine.setSyncOffsetMs).toHaveBeenLastCalledWith(0);
        expect(screen.getByLabelText('Visual timing')).toHaveValue('0');
    });

    it('can be reached with the keyboard', async () => {
        const { user } = renderWithProviders(<SyncOffsetSetting />);

        await user.tab();
        expect(screen.getByText('Sync')).toHaveFocus();
    });
});
