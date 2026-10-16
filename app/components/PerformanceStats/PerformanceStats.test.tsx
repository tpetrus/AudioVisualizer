// @vitest-environment jsdom
import { act, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// PerformanceStats caches the GPU description at module level (one probe per page load). Each test loads a fresh copy
// of the app modules, so the probe runs again; the test helpers are loaded together with it so they all share the same
// copy of the audio context. React and Testing Library are external and stay shared.
async function loadFresh() {
    vi.resetModules();
    const { PerformanceStats } = await import('./PerformanceStats');
    const { renderWithProviders } = await import('~/test/renderWithProviders');
    const { FakeAudioEngine } = await import('~/test/fakeEngines');
    return { PerformanceStats, renderWithProviders, FakeAudioEngine };
}

// Frame callbacks the component asked for, so a test decides exactly when each frame happens and at what timestamp.
let frameCallbacks: Map<number, FrameRequestCallback>;
let nextFrameId: number;

function runFrame(time: number) {
    const [id, callback] = [...frameCallbacks][0];
    frameCallbacks.delete(id);
    act(() => callback(time));
}

function stubWebGl(options: { webgl2?: boolean; webgl?: boolean; debugInfo?: boolean; loseContext?: boolean }) {
    const loseContext = vi.fn();
    const gl = {
        getExtension: vi.fn((name: string) => {
            if (name === 'WEBGL_debug_renderer_info')
                return options.debugInfo === false ? null : { UNMASKED_RENDERER_WEBGL: 1 };
            if (name === 'WEBGL_lose_context') return options.loseContext === false ? null : { loseContext };
            return null;
        }),
        getParameter: vi.fn(() => 'Fake GPU 9000'),
    };
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(((type: string) => {
        if (type === 'webgl2') return options.webgl2 ? gl : null;
        if (type === 'webgl') return options.webgl ? gl : null;
        return null;
    }) as HTMLCanvasElement['getContext']);
    return { gl, loseContext };
}

describe('PerformanceStats', () => {
    beforeEach(() => {
        vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
        frameCallbacks = new Map();
        nextFrameId = 1;
        vi.stubGlobal(
            'requestAnimationFrame',
            vi.fn((callback: FrameRequestCallback) => {
                const id = nextFrameId++;
                frameCallbacks.set(id, callback);
                return id;
            }),
        );
        vi.stubGlobal(
            'cancelAnimationFrame',
            vi.fn((id: number) => {
                frameCallbacks.delete(id);
            }),
        );
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('names the GPU and releases the probe context', async () => {
        const { loseContext } = stubWebGl({ webgl2: true });
        const { PerformanceStats, renderWithProviders } = await loadFresh();
        renderWithProviders(<PerformanceStats />);

        expect(screen.getByText('GPU: Fake GPU 9000')).toBeInTheDocument();
        expect(loseContext).toHaveBeenCalledTimes(1);
    });

    it('falls back to WebGL 1 when WebGL 2 is missing', async () => {
        stubWebGl({ webgl: true });
        const { PerformanceStats, renderWithProviders } = await loadFresh();
        renderWithProviders(<PerformanceStats />);

        expect(screen.getByText('GPU: Fake GPU 9000')).toBeInTheDocument();
    });

    it('says so when WebGL is unavailable', async () => {
        stubWebGl({});
        const { PerformanceStats, renderWithProviders } = await loadFresh();
        renderWithProviders(<PerformanceStats />);

        expect(screen.getByText('GPU: WebGL unavailable')).toBeInTheDocument();
    });

    it('reports an unknown renderer when the debug extension is missing, and tolerates a missing lose-context extension', async () => {
        stubWebGl({ webgl2: true, debugInfo: false, loseContext: false });
        const { PerformanceStats, renderWithProviders } = await loadFresh();
        renderWithProviders(<PerformanceStats />);

        expect(screen.getByText('GPU: unknown')).toBeInTheDocument();
    });

    it('asks the GPU only once per page load', async () => {
        const { gl } = stubWebGl({ webgl2: true });
        const { PerformanceStats, renderWithProviders } = await loadFresh();
        const first = renderWithProviders(<PerformanceStats />);
        first.unmount();
        renderWithProviders(<PerformanceStats />);

        expect(gl.getParameter).toHaveBeenCalledTimes(1);
    });

    it('summarises frame pacing twice a second', async () => {
        stubWebGl({});
        const { PerformanceStats, renderWithProviders } = await loadFresh();
        renderWithProviders(<PerformanceStats />);
        expect(screen.getByText('0 fps · avg 0 ms')).toBeInTheDocument();

        // The first frame only starts the clock; the next two measure 20 ms and 50 ms (one slow frame).
        runFrame(1000);
        runFrame(1020);
        runFrame(1070);
        act(() => {
            vi.advanceTimersByTime(500);
        });

        expect(screen.getByText('29 fps · avg 35.0 ms')).toBeInTheDocument();
        expect(screen.getByText(/worst frame 50\.0 ms/)).toHaveTextContent('slow frames (>25 ms, last 0.5 s): 1');
    });

    it('keeps the previous frame figures when no frame ran in the window and starts a new window after each summary', async () => {
        stubWebGl({});
        const { PerformanceStats, renderWithProviders } = await loadFresh();
        renderWithProviders(<PerformanceStats />);

        runFrame(100);
        runFrame(120);
        act(() => {
            vi.advanceTimersByTime(500);
        });
        expect(screen.getByText('50 fps · avg 20.0 ms')).toBeInTheDocument();

        act(() => {
            vi.advanceTimersByTime(500);
        });
        expect(screen.getByText('50 fps · avg 20.0 ms')).toBeInTheDocument();
        expect(screen.getByText(/slow frames/)).toHaveTextContent(': 0');
    });

    it('shows the audio latency figures and n/a for the ones the browser lacks', async () => {
        stubWebGl({});
        const { PerformanceStats, renderWithProviders, FakeAudioEngine } = await loadFresh();
        const engine = new FakeAudioEngine();
        engine.latencyInfo = { sampleRate: 48000, baseLatencyMs: 10, captureLatencyMs: 20.04 };
        renderWithProviders(<PerformanceStats />, { engine });

        expect(screen.getByText('sample rate 48000 Hz')).toBeInTheDocument();
        expect(screen.getByText('context latency 10.0 ms · output n/a')).toBeInTheDocument();
        expect(screen.getByText('capture latency 20.0 ms')).toBeInTheDocument();
        expect(screen.getByText('analysis window n/a')).toBeInTheDocument();
    });

    it('refreshes the audio figures on each sample and shows a dash before a source has a sample rate', async () => {
        stubWebGl({});
        const { PerformanceStats, renderWithProviders, FakeAudioEngine } = await loadFresh();
        const engine = new FakeAudioEngine();
        renderWithProviders(<PerformanceStats />, { engine });
        expect(screen.getByText('sample rate – Hz')).toBeInTheDocument();

        engine.latencyInfo = { sampleRate: 44100, analysisWindowMs: 46.4 };
        act(() => {
            vi.advanceTimersByTime(500);
        });
        expect(screen.getByText('sample rate 44100 Hz')).toBeInTheDocument();
        expect(screen.getByText('analysis window 46.4 ms')).toBeInTheDocument();
    });

    it('stops sampling and cancels its frame request on unmount', async () => {
        stubWebGl({});
        const { PerformanceStats, renderWithProviders } = await loadFresh();
        const { unmount } = renderWithProviders(<PerformanceStats />);
        expect(frameCallbacks.size).toBe(1);
        expect(vi.getTimerCount()).toBe(1);

        unmount();
        expect(frameCallbacks.size).toBe(0);
        expect(vi.getTimerCount()).toBe(0);
    });
});
