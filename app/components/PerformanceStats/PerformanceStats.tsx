import { useEffect, useState } from 'react';
import { useAudio } from '~/features/audio/audioEngineContext';

// How often the overlay updates; frame figures cover this window.
const SAMPLE_INTERVAL_MS = 500;
// Frames slower than this count as slow (below ~40 fps).
const SLOW_FRAME_MS = 25;

type LatencyInfo = ReturnType<typeof useAudio>['latencyInfo'];

interface FrameStats {
    fps: number;
    avgFrameMs: string;
    worstFrameMs: string;
    slowFrames: number;
}

interface Stats {
    frames: FrameStats;
    audio: LatencyInfo;
}

const NO_FRAMES: FrameStats = { fps: 0, avgFrameMs: '0', worstFrameMs: '0', slowFrames: 0 };

// Debug overlay: separates rendering cost (frame pacing) from audio-path latency.
export function PerformanceStats() {
    const engine = useAudio();
    const [stats, setStats] = useState<Stats>(() => ({ frames: NO_FRAMES, audio: engine.latencyInfo }));
    const [gpu] = useState(describeGpu);

    useEffect(() => {
        // Frame pacing is measured with plain variables; only the twice-a-second summary goes into state.
        let frameId = 0;
        let lastFrame = 0;
        let frames = 0;
        let totalMs = 0;
        let worstMs = 0;
        let slow = 0;

        const tick = (now: number) => {
            if (lastFrame) {
                const delta = now - lastFrame;
                frames++;
                totalMs += delta;
                worstMs = Math.max(worstMs, delta);
                if (delta > SLOW_FRAME_MS) {
                    slow++;
                }
            }
            lastFrame = now;
            frameId = requestAnimationFrame(tick);
        };
        frameId = requestAnimationFrame(tick);

        const timer = window.setInterval(() => {
            // Read the counters now: they're reset below, before React runs the state update.
            const frameStats: FrameStats | undefined = frames
                ? {
                    fps: Math.round(1000 / (totalMs / frames)),
                    avgFrameMs: (totalMs / frames).toFixed(1),
                    worstFrameMs: worstMs.toFixed(1),
                    slowFrames: slow,
                }
                : undefined;
            const audio = engine.latencyInfo;
            setStats(current => ({ frames: frameStats ?? current.frames, audio }));
            frames = totalMs = worstMs = slow = 0;
        }, SAMPLE_INTERVAL_MS);

        return () => {
            cancelAnimationFrame(frameId);
            window.clearInterval(timer);
        };
    }, [engine]);

    const { frames, audio } = stats;
    return (
        <div className="pointer-events-none fixed bottom-3 left-3 z-10 rounded-md bg-black/75 px-2.5 py-2 font-mono text-xs text-[#9f9]">
            <div><b>Rendering</b></div>
            <div>GPU: {gpu}</div>
            <div>{frames.fps} fps · avg {frames.avgFrameMs} ms</div>
            <div>
                worst frame {frames.worstFrameMs} ms · slow frames (&gt;{SLOW_FRAME_MS} ms, last {SAMPLE_INTERVAL_MS / 1000} s): {frames.slowFrames}
            </div>
            <div className="mt-1.5"><b>Audio</b></div>
            <div>sample rate {audio.sampleRate || '–'} Hz</div>
            <div>context latency {formatMs(audio.baseLatencyMs)} · output {formatMs(audio.outputLatencyMs)}</div>
            <div>capture latency {formatMs(audio.captureLatencyMs)}</div>
            <div>analysis window {formatMs(audio.analysisWindowMs)}</div>
        </div>
    );
}

function formatMs(ms: number | undefined): string {
    return ms === undefined ? 'n/a' : `${ms.toFixed(1)} ms`;
}

// Asked once per page load: each query needs a throwaway WebGL context.
let cachedGpu: string | undefined;

// Software renderers (SwiftShader, llvmpipe, Microsoft Basic Render) mean hardware acceleration isn't working.
function describeGpu(): string {
    cachedGpu ??= queryGpu();
    return cachedGpu;
}

function queryGpu(): string {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2') ?? canvas.getContext('webgl');
    if (!gl) {
        return 'WebGL unavailable';
    }
    const info = gl.getExtension('WEBGL_debug_renderer_info');
    const renderer = info ? String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL)) : 'unknown';
    // Release the probe context now instead of waiting for garbage collection (browsers cap live contexts at ~16).
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return renderer;
}
