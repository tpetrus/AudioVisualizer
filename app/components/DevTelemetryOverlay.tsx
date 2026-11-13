import { useEffect, useRef, useSyncExternalStore, type CSSProperties } from 'react';
import { useAudio } from '~/features/audio/audioEngineContext';
import { rhythmTracker } from '~/features/rhythm/rhythmTracker';
import {
    attachTelemetry,
    getTelemetryView,
    subscribeTelemetryProbes,
    telemetryProbeCount,
    type TelemetryView,
} from '~/features/audio/devTelemetry';

// DEV only (mounted through an `import.meta.env.DEV`-guarded lazy import in root.tsx): the latest telemetry numbers and
// a sparkline of the first probe's input and output. It refreshes on a timer, not per frame, and reads the recorder
// through refs, so it adds no React renders while a visualizer runs.

const REFRESH_MS = 250;
// Rows of history the sparkline draws (about two seconds at 120 rows per second).
const HISTORY_ROWS = 240;
const SPARK_WIDTH = 200;
const SPARK_HEIGHT = 40;

// Inline styles only: a new Tailwind class name would grow the production stylesheet even though this is DEV-only.
// Top left, because the control panel is top right and the performance and rhythm stats sit along the bottom.
const PANEL_STYLE: CSSProperties = {
    position: 'fixed',
    top: 12,
    left: 12,
    zIndex: 10,
    pointerEvents: 'none',
    padding: '8px 10px',
    borderRadius: 6,
    background: 'rgba(0, 0, 0, 0.75)',
    color: '#9f9',
    font: '12px monospace',
};
const TEXT_STYLE: CSSProperties = { margin: 0, whiteSpace: 'pre' };

export function DevTelemetryOverlay() {
    const engine = useAudio();
    const probeCount = useSyncExternalStore(subscribeTelemetryProbes, telemetryProbeCount, telemetryProbeCount);
    const visible = probeCount > 0;
    const textRef = useRef<HTMLPreElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);

    useEffect(() => attachTelemetry(engine, rhythmTracker.state), [engine]);

    useEffect(() => {
        if (!visible) return;
        const refresh = () => {
            const view = getTelemetryView();
            if (!view || view.rowCount === 0) return;
            if (textRef.current) textRef.current.textContent = formatLatest(view);
            drawSparkline(canvasRef.current, view);
        };
        refresh();
        const timer = setInterval(refresh, REFRESH_MS);
        return () => clearInterval(timer);
    }, [visible]);

    if (!visible) return null;
    return (
        <div aria-hidden="true" style={PANEL_STYLE}>
            <pre ref={textRef} style={TEXT_STYLE} />
            <canvas ref={canvasRef} width={SPARK_WIDTH} height={SPARK_HEIGHT} style={{ display: 'block' }} />
        </div>
    );
}

// The first probe's `in` / `out` column positions, or -1 when absent.
function probeColumns(view: TelemetryView): { input: number; output: number } {
    return {
        input: view.columns.findIndex((name) => name.endsWith('.in')),
        output: view.columns.findIndex((name) => name.endsWith('.out')),
    };
}

function formatLatest(view: TelemetryView): string {
    const width = view.columns.length;
    const base = (view.rowCount - 1) * width;
    const value = (column: number) => view.rows[base + column].toFixed(3);
    const { input, output } = probeColumns(view);
    return [
        `bassRaw  ${value(3)}`,
        `bassPost ${value(4)}`,
        `gain     ${value(5)}`,
        `fps      ${value(2)}`,
        `in       ${value(input)}`,
        `out      ${value(output)}`,
    ].join('\n');
}

function drawSparkline(canvas: HTMLCanvasElement | null, view: TelemetryView): void {
    const context = canvas?.getContext('2d');
    if (!canvas || !context) return;
    const { input, output } = probeColumns(view);
    const width = view.columns.length;
    const count = Math.min(view.rowCount, HISTORY_ROWS);
    const first = view.rowCount - count;

    // One shared scale, so in and out can be compared by eye.
    let max = 1e-6;
    for (let i = 0; i < count; i++) {
        max = Math.max(max, view.rows[(first + i) * width + input], view.rows[(first + i) * width + output]);
    }

    context.clearRect(0, 0, canvas.width, canvas.height);
    const line = (column: number, color: string) => {
        context.strokeStyle = color;
        context.beginPath();
        for (let i = 0; i < count; i++) {
            const x = (i / (HISTORY_ROWS - 1)) * canvas.width;
            const y = canvas.height - (view.rows[(first + i) * width + column] / max) * canvas.height;
            if (i === 0) context.moveTo(x, y);
            else context.lineTo(x, y);
        }
        context.stroke();
    };
    line(input, '#6cf');
    line(output, '#fc6');
}
