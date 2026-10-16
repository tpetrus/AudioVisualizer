// @vitest-environment jsdom
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '~/test/renderWithProviders';
import { ControlPanel } from './ControlPanel';
import type { ControlDefinition } from './controls';
import { useControlValues } from './useControlValues';

const definitions = [
    {
        section: 'Response',
        key: 'sensitivity',
        label: 'Sensitivity',
        type: 'range',
        min: 0,
        max: 2,
        step: 0.1,
        default: 1,
    },
    {
        section: 'Response',
        key: 'smoothing',
        label: 'Smoothing',
        type: 'range',
        min: 0,
        max: 1,
        step: 0.1,
        default: 0.5,
    },
    { section: 'Look', key: 'tint', label: 'Tint', type: 'color', default: '#ff0000' },
    { section: 'Look', key: 'bump', label: 'Bass bump', type: 'checkbox', default: true },
    {
        section: 'Look',
        key: 'bumpSize',
        label: 'Bump size',
        type: 'range',
        min: 0,
        max: 1,
        step: 0.1,
        default: 0.5,
        shownWhen: 'bump',
    },
] as const satisfies readonly ControlDefinition[];

interface HarnessProps {
    onResetAll?: () => void;
    onCameraLockedChange?: (locked: boolean) => void;
    onResetView?: () => void;
    viewChanged?: boolean;
    cameraLocked?: boolean;
}

// Holds the values the way a visualizer page does, so changes made through the panel show up in it.
function Harness({
    onResetAll,
    onCameraLockedChange = () => {},
    onResetView = () => {},
    viewChanged = false,
    cameraLocked = true,
}: HarnessProps) {
    const { values, setValue, resetAll } = useControlValues(definitions);
    return (
        <ControlPanel
            definitions={definitions}
            values={values}
            onChange={setValue}
            onResetAll={() => {
                resetAll();
                onResetAll?.();
            }}
            cameraLocked={cameraLocked}
            onCameraLockedChange={onCameraLockedChange}
            viewChanged={viewChanged}
            onResetView={onResetView}
        />
    );
}

// The GPU probe in PerformanceStats needs a canvas context, which jsdom does not provide.
beforeEach(() => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
});

async function openPanel(props: HarnessProps = {}) {
    const rendered = renderWithProviders(<Harness {...props} />);
    await rendered.user.click(screen.getByRole('button', { name: /settings/i }));
    return rendered;
}

describe('ControlPanel', () => {
    it('starts collapsed and expands and collapses from the toggle button', async () => {
        const { user } = renderWithProviders(<Harness />);
        expect(screen.queryByText('Response')).not.toBeInTheDocument();

        await user.click(screen.getByRole('button', { name: /settings/i }));
        expect(screen.getByText('Response')).toBeInTheDocument();
        expect(screen.getByText('Look')).toBeInTheDocument();

        await user.click(screen.getByRole('button', { name: /close/i }));
        expect(screen.queryByText('Response')).not.toBeInTheDocument();
    });

    it('opens only the first section and lets the user open and close sections', async () => {
        const { user, container } = await openPanel();
        const [response, look] = Array.from(container.querySelectorAll('details'));
        expect(response).toHaveAttribute('open');
        expect(look).not.toHaveAttribute('open');

        await user.click(within(look).getByText('Look'));
        await waitFor(() => expect(look).toHaveAttribute('open'));
        expect(response).toHaveAttribute('open');

        await user.click(within(response).getByText('Response'));
        await waitFor(() => expect(response).not.toHaveAttribute('open'));
    });

    it('shows every control of a section with its label and current value', async () => {
        const { user } = await openPanel();
        expect(screen.getByLabelText('Sensitivity')).toHaveValue('1');
        expect(screen.getByLabelText('Smoothing')).toHaveValue('0.5');

        await user.click(screen.getByText('Look'));
        await waitFor(() => expect(screen.getByLabelText('Bass bump')).toBeVisible());
        expect(screen.getByLabelText('Bass bump')).toBeChecked();
        expect(screen.getByLabelText('Tint')).toHaveValue('#ff0000');
    });

    it('reports changes, counts modified settings and resets a single field', async () => {
        const { user } = await openPanel();
        expect(screen.queryByText(/changed/)).not.toBeInTheDocument();

        fireEvent.change(screen.getByLabelText('Sensitivity'), { target: { value: '1.5' } });
        expect(screen.getByLabelText('Sensitivity')).toHaveValue('1.5');
        expect(screen.getByText('1 changed')).toBeInTheDocument();

        fireEvent.change(screen.getByLabelText('Smoothing'), { target: { value: '0.9' } });
        expect(screen.getByText('2 changed')).toBeInTheDocument();

        await user.click(screen.getByRole('button', { name: 'Reset Sensitivity to default' }));
        expect(screen.getByLabelText('Sensitivity')).toHaveValue('1');
        expect(screen.getByText('1 changed')).toBeInTheDocument();
    });

    it('hides the per-field reset button until the value differs from its default', async () => {
        await openPanel();
        // The button stays in the layout (so rows do not jump) but is invisible while unmodified.
        const reset = screen.getByLabelText('Reset Sensitivity to default');
        expect(reset).toHaveStyle({ visibility: 'hidden' });

        fireEvent.change(screen.getByLabelText('Sensitivity'), { target: { value: '0.2' } });
        expect(screen.getByRole('button', { name: 'Reset Sensitivity to default' })).toHaveStyle({
            visibility: 'visible',
        });
    });

    it('shows a conditional control only while the control it depends on is on', async () => {
        const { user } = await openPanel();
        await user.click(screen.getByText('Look'));
        await waitFor(() => expect(screen.getByLabelText('Bump size')).toBeInTheDocument());

        await user.click(screen.getByLabelText('Bass bump'));
        expect(screen.queryByLabelText('Bump size')).not.toBeInTheDocument();

        await user.click(screen.getByLabelText('Bass bump'));
        expect(screen.getByLabelText('Bump size')).toBeInTheDocument();
    });

    it('changes colour controls', async () => {
        const { user } = await openPanel();
        await user.click(screen.getByText('Look'));
        await waitFor(() => expect(screen.getByLabelText('Tint')).toBeInTheDocument());

        fireEvent.change(screen.getByLabelText('Tint'), { target: { value: '#00ff00' } });
        expect(screen.getByLabelText('Tint')).toHaveValue('#00ff00');
    });

    it('resets everything with Reset all', async () => {
        const onResetAll = vi.fn();
        const { user } = await openPanel({ onResetAll });
        fireEvent.change(screen.getByLabelText('Sensitivity'), { target: { value: '1.5' } });

        await user.click(screen.getByRole('button', { name: 'Reset all' }));
        expect(onResetAll).toHaveBeenCalledTimes(1);
        expect(screen.getByLabelText('Sensitivity')).toHaveValue('1');
        expect(screen.queryByText(/changed/)).not.toBeInTheDocument();
    });

    it('labels the camera lock by state and asks to flip it', async () => {
        const onCameraLockedChange = vi.fn();
        const first = renderWithProviders(<Harness cameraLocked onCameraLockedChange={onCameraLockedChange} />);
        const locked = screen.getByRole('button', { name: 'Camera locked. Click to unlock' });
        expect(locked).toHaveAttribute('aria-pressed', 'true');
        await first.user.click(locked);
        expect(onCameraLockedChange).toHaveBeenCalledWith(false);
        first.unmount();

        renderWithProviders(<Harness cameraLocked={false} onCameraLockedChange={onCameraLockedChange} />);
        const unlocked = screen.getByRole('button', { name: 'Camera unlocked. Click to lock' });
        expect(unlocked).toHaveAttribute('aria-pressed', 'false');
        expect(unlocked).toHaveAttribute('title', expect.stringContaining('drag to rotate'));
    });

    it('offers Reset view only after the view moved', async () => {
        const onResetView = vi.fn();
        const first = renderWithProviders(<Harness viewChanged={false} />);
        expect(screen.queryByRole('button', { name: 'Reset view' })).not.toBeInTheDocument();
        first.unmount();

        const second = renderWithProviders(<Harness viewChanged onResetView={onResetView} />);
        await second.user.click(screen.getByRole('button', { name: 'Reset view' }));
        expect(onResetView).toHaveBeenCalledTimes(1);
    });

    it('toggles the performance and rhythm overlays', async () => {
        const { user } = await openPanel();
        expect(screen.queryByText('Rendering')).not.toBeInTheDocument();
        expect(screen.queryByText('Rhythm')).not.toBeInTheDocument();

        await user.click(screen.getByRole('checkbox', { name: /performance stats/i }));
        expect(screen.getByText('Rendering')).toBeInTheDocument();
        await user.click(screen.getByRole('checkbox', { name: /performance stats/i }));
        expect(screen.queryByText('Rendering')).not.toBeInTheDocument();

        await user.click(screen.getByRole('checkbox', { name: /rhythm stats/i }));
        expect(screen.getByText('Rhythm')).toBeInTheDocument();
        await user.click(screen.getByRole('checkbox', { name: /rhythm stats/i }));
        expect(screen.queryByText('Rhythm')).not.toBeInTheDocument();
    });

    it('opens the audio settings dialog and closes it again', async () => {
        const { user, engine } = renderWithProviders(<Harness />);
        // The dialog can only be dismissed while a source is capturing.
        engine.setAnalyser({} as AnalyserNode);
        await user.click(screen.getByRole('button', { name: /settings/i }));

        await user.click(screen.getByRole('button', { name: 'Audio settings' }));
        expect(screen.getByRole('dialog', { name: 'Audio source' })).toBeInTheDocument();

        await user.click(screen.getByRole('button', { name: 'Close' }));
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
});
