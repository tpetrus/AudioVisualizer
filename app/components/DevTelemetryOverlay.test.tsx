// @vitest-environment jsdom
import { act } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '~/test/renderWithProviders';
import { DevTelemetryOverlay } from './DevTelemetryOverlay';

// The recorder has its own spec; here it is replaced by state the spec controls.
const recorder = vi.hoisted(() => ({
    attach: vi.fn(),
    detach: vi.fn(),
    count: 0,
    view: undefined as unknown,
    listeners: new Set<() => void>(),
}));
vi.mock('~/features/audio/devTelemetry', () => ({
    attachTelemetry: (engine: unknown) => {
        recorder.attach(engine);
        return recorder.detach;
    },
    getTelemetryView: () => recorder.view,
    subscribeTelemetryProbes: (listener: () => void) => {
        recorder.listeners.add(listener);
        return () => recorder.listeners.delete(listener);
    },
    telemetryProbeCount: () => recorder.count,
}));

const COLUMNS = ['t', 'dt', 'fps', 'bassRaw', 'bassPost', 'gain', 'cubes.in', 'cubes.out'];

function setView(rows: number[][]) {
    recorder.view = { columns: COLUMNS, rows: Float32Array.from(rows.flat()), rowCount: rows.length };
}

function setProbes(count: number) {
    recorder.count = count;
    recorder.listeners.forEach((listener) => listener());
}

// A recording stand-in for a 2D canvas context.
function fakeContext() {
    return {
        clearRect: vi.fn(),
        beginPath: vi.fn(),
        moveTo: vi.fn(),
        lineTo: vi.fn(),
        stroke: vi.fn(),
        strokeStyle: '',
    };
}

describe('DevTelemetryOverlay', () => {
    let context: ReturnType<typeof fakeContext> | null;

    beforeEach(() => {
        vi.useFakeTimers();
        recorder.attach.mockClear();
        recorder.detach.mockClear();
        recorder.count = 0;
        recorder.view = undefined;
        recorder.listeners.clear();
        context = fakeContext();
        vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => context as never);
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('attaches the recorder to the engine and detaches on unmount', () => {
        const { engine, unmount } = renderWithProviders(<DevTelemetryOverlay />);

        expect(recorder.attach).toHaveBeenCalledWith(engine);
        expect(recorder.detach).not.toHaveBeenCalled();

        unmount();

        expect(recorder.detach).toHaveBeenCalledTimes(1);
    });

    it('renders nothing while no probe is registered', () => {
        const { container } = renderWithProviders(<DevTelemetryOverlay />);

        expect(container).toBeEmptyDOMElement();
    });

    it('shows the latest numbers and draws the sparkline once a probe registers', () => {
        setView([
            [0.1, 0.01, 100, 0.2, 0.3, 1.5, 0.4, 0.2],
            [0.2, 0.0125, 80, 0.25, 0.5, 2, 0.5, 0.25],
        ]);
        setProbes(1);
        const { container } = renderWithProviders(<DevTelemetryOverlay />);

        const panel = container.firstElementChild!;
        expect(panel).toHaveAttribute('aria-hidden', 'true');
        expect(panel.textContent).toContain('bassRaw  0.250');
        expect(panel.textContent).toContain('bassPost 0.500');
        expect(panel.textContent).toContain('gain     2.000');
        expect(panel.textContent).toContain('fps      80.000');
        expect(panel.textContent).toContain('in       0.500');
        expect(panel.textContent).toContain('out      0.250');
        expect(context!.stroke).toHaveBeenCalledTimes(2);
        expect(context!.moveTo).toHaveBeenCalledTimes(2);
        expect(context!.lineTo).toHaveBeenCalledTimes(2);
    });

    it('shows and hides itself as probes come and go', () => {
        setView([[0, 0.01, 100, 0, 0, 1, 0, 0]]);
        const { container } = renderWithProviders(<DevTelemetryOverlay />);
        expect(container).toBeEmptyDOMElement();

        act(() => setProbes(1));
        expect(container.firstElementChild).not.toBeNull();

        act(() => setProbes(0));
        expect(container).toBeEmptyDOMElement();
    });

    it('refreshes on a timer and stops the timer on unmount', () => {
        setView([[0, 0.01, 100, 0.1, 0.1, 1, 0.1, 0.1]]);
        setProbes(1);
        const { container, unmount } = renderWithProviders(<DevTelemetryOverlay />);
        expect(container.textContent).toContain('bassRaw  0.100');

        setView([[0, 0.01, 100, 0.9, 0.1, 1, 0.1, 0.1]]);
        act(() => {
            vi.advanceTimersByTime(250);
        });
        expect(container.textContent).toContain('bassRaw  0.900');

        unmount();
        expect(vi.getTimerCount()).toBe(0);
    });

    it('waits for a first row before showing numbers', () => {
        setView([]);
        setProbes(1);
        const { container } = renderWithProviders(<DevTelemetryOverlay />);
        expect(container.textContent).toBe('');

        recorder.view = undefined;
        act(() => {
            vi.advanceTimersByTime(250);
        });
        expect(container.textContent).toBe('');
        expect(context!.stroke).not.toHaveBeenCalled();
    });

    it('still shows the numbers when the canvas has no 2D context, as in jsdom', () => {
        context = null;
        setView([[0, 0.01, 100, 0.2, 0.3, 1, 0.4, 0.2]]);
        setProbes(1);
        const { container } = renderWithProviders(<DevTelemetryOverlay />);

        expect(container.textContent).toContain('bassPost 0.300');
    });
});
