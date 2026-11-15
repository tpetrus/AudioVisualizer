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

    it('moves by keyboard focus and a step change, updating the engine value and aria-valuetext', async () => {
        const { engine, user } = renderWithProviders(<SyncOffsetSetting />);

        // Summary first, then the slider: the slider is reachable by Tab, found by its label.
        await user.tab();
        await user.tab();
        const slider = screen.getByLabelText('Visual timing');
        expect(slider).toHaveFocus();

        // jsdom does not turn arrow keys into range changes, so the browser's one-step result is sent as a change.
        fireEvent.change(slider, { target: { value: '5' } });
        expect(engine.getSyncOffsetMs()).toBe(5);
        expect(slider).toHaveAttribute('aria-valuetext', '5 ms later');

        fireEvent.change(slider, { target: { value: '-200' } });
        expect(engine.getSyncOffsetMs()).toBe(-200);
        expect(slider).toHaveAttribute('aria-valuetext', '200 ms earlier');
    });

    it('can be reached with the keyboard', async () => {
        const { user } = renderWithProviders(<SyncOffsetSetting />);

        await user.tab();
        expect(screen.getByText('Sync')).toHaveFocus();
    });
});
