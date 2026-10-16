// @vitest-environment jsdom
import { fireEvent, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderWithProviders } from '~/test/renderWithProviders';
import { NormalizeSettings } from './NormalizeSettings';

describe('NormalizeSettings', () => {
    it('lists each tuning slider with the engine value, unit and help text', () => {
        renderWithProviders(<NormalizeSettings />);

        expect(screen.getByLabelText('Target level')).toHaveValue('0.7');
        expect(screen.getByLabelText('Maximum boost')).toHaveValue('16');
        expect(screen.getByLabelText('Peak memory')).toHaveValue('3');
        expect(screen.getByLabelText('Recovery time')).toHaveValue('0.4');
        expect(screen.getByLabelText('Noise floor')).toHaveValue('0.004');
        // Units are appended to the printed value.
        expect(screen.getByText('16x')).toBeInTheDocument();
        expect(screen.getByText('3 s')).toBeInTheDocument();
        expect(screen.getByText(/Upper limit on amplification/)).toBeInTheDocument();
    });

    it('gives the sliders the limits of each setting', () => {
        renderWithProviders(<NormalizeSettings />);

        const boost = screen.getByLabelText('Maximum boost');
        expect(boost).toHaveAttribute('min', '1');
        expect(boost).toHaveAttribute('max', '32');
        expect(boost).toHaveAttribute('step', '1');
    });

    it('sends only the changed setting, as a number, to the engine', () => {
        const { engine } = renderWithProviders(<NormalizeSettings />);

        fireEvent.change(screen.getByLabelText('Maximum boost'), { target: { value: '8' } });

        expect(engine.updateNormalizeOptions).toHaveBeenCalledWith({ maxGain: 8 });
        // The fake notifies like the real engine, so the slider shows the new value.
        expect(screen.getByLabelText('Maximum boost')).toHaveValue('8');
        expect(screen.getByText('8x')).toBeInTheDocument();
    });

    it('restores the defaults through the engine', async () => {
        const { engine, user } = renderWithProviders(<NormalizeSettings />);
        fireEvent.change(screen.getByLabelText('Maximum boost'), { target: { value: '8' } });

        await user.click(screen.getByText('Normalization settings'));
        await user.click(screen.getByRole('button', { name: 'Reset to defaults' }));

        expect(engine.resetNormalizeOptions).toHaveBeenCalledTimes(1);
        expect(screen.getByLabelText('Maximum boost')).toHaveValue('16');
    });
});
