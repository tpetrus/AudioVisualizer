import type { AudioEngine } from './audioEngine';
import { getActivePlayback } from './devFileSource';

// DEV only: records one row per rendered frame (time, frame time, bass before and after the gain stage, AGC gain and
// whatever each visualizer's probe reports) so the bass-driven values can be watched live or exported. Every entry
// point is a no-op outside `import.meta.env.DEV`, and callers also guard the call itself so production drops it.

// Writes this probe's columns, in order, from index 0. Called once per tick, so it must not allocate.
export type TelemetryRead = (out: Float32Array) => void;

// What `window.__vizTelemetry` offers a script or the console.
export interface VizTelemetryHook {
    readonly columns: string[];
    readonly rowCount: number;
    readonly overflowed: boolean;
    snapshot(): Float32Array;
    reset(capacitySeconds?: number): void;
    playback(): { position: number; duration: number; ended: boolean } | null;
    seek(seconds: number): void;
    // The engine's volume normalization, so a run can compare with it off. Setting it saves it to storage like the
    // settings panel does; the harness runs in a fresh browser profile, so nothing of the developer's is changed.
    normalize(): boolean;
    setNormalize(enabled: boolean): void;
}

// The part of the rhythm tracker's state the recorder reads. Passed in by the overlay rather than imported, so this
// module keeps depending on the audio engine alone.
export interface TelemetryOnsets {
    readonly bandOnsets: ArrayLike<number>;
}

declare global {
    interface Window {
        __vizTelemetry?: VizTelemetryHook;
    }
}

// A live, uncopied view of the recorder, for the overlay.
export interface TelemetryView {
    readonly columns: readonly string[];
    readonly rows: Float32Array;
    readonly rowCount: number;
}

const ROWS_PER_SECOND = 120;
const DEFAULT_CAPACITY_SECONDS = 600;
const BASS_CUTOFF_HZ = 120;
const BASS_FFT_SIZE = 4096;
// t, dt, fps, bassRaw, bassPost, gain, then the tracker's per-band onset strengths (kick, mid, high) exactly as the
// visualizers read them in `RhythmState.bandOnsets`, 0 while no tracker is attached.
const BASE_COLUMNS = ['t', 'dt', 'fps', 'bassRaw', 'bassPost', 'gain', 'onsetKick', 'onsetMid', 'onsetHigh'] as const;
const ONSET_COLUMNS = 3;

interface Probe {
    readonly name: string;
    readonly columns: readonly string[];
    readonly read: TelemetryRead;
    readonly scratch: Float32Array;
}

// One analyser tapped from a node, with the bins that cover the bass preallocated.
interface BassTap {
    readonly node: AudioNode;
    readonly analyser: AnalyserNode;
    readonly bytes: Uint8Array<ArrayBuffer>;
    readonly binCount: number;
}

interface Recorder {
    engine: AudioEngine;
    raw: BassTap | undefined;
    post: BassTap | undefined;
    onsets: TelemetryOnsets | undefined;
    unsubscribe: () => void;
}

const probes: Probe[] = [];
const probeListeners = new Set<() => void>();
let recorder: Recorder | undefined;
let capacitySeconds = DEFAULT_CAPACITY_SECONDS;
let columns: string[] = [...BASE_COLUMNS];
let rows = new Float32Array(0);
let capacityRows = 0;
let rowCount = 0;
let overflowed = false;

export function registerTelemetryProbe(name: string, probeColumns: readonly string[], read: TelemetryRead): () => void {
    if (!import.meta.env.DEV) return () => {};
    const probe: Probe = { name, columns: probeColumns, read, scratch: new Float32Array(probeColumns.length) };
    probes.push(probe);
    layoutChanged();
    return () => {
        const index = probes.indexOf(probe);
        if (index < 0) return;
        probes.splice(index, 1);
        layoutChanged();
    };
}

export function tickTelemetry(dtSeconds: number): void {
    if (!import.meta.env.DEV || !recorder) return;
    if (rowCount >= capacityRows) {
        overflowed = true;
        return;
    }
    const { engine, raw, post } = recorder;
    // No source (none chosen yet, or the track ended and stopped the engine): there is nothing to measure, and rows
    // written now would have t = 0 and fold back into the start of the recording.
    if (!post) return;
    const offset = rowCount * columns.length;
    const playback = getActivePlayback();

    rows[offset] = playback ? playback.position() : post.analyser.context.currentTime;
    rows[offset + 1] = dtSeconds;
    rows[offset + 2] = dtSeconds > 0 ? 1 / dtSeconds : 0;
    rows[offset + 3] = raw ? readBass(raw) : 0;
    rows[offset + 4] = readBass(post);
    rows[offset + 5] = engine.getGain();
    const onsets = recorder.onsets?.bandOnsets;
    for (let band = 0; band < ONSET_COLUMNS; band++) rows[offset + 6 + band] = onsets ? (onsets[band] ?? 0) : 0;

    let at = offset + BASE_COLUMNS.length;
    for (const probe of probes) {
        probe.read(probe.scratch);
        rows.set(probe.scratch, at);
        at += probe.columns.length;
    }
    rowCount++;
}

export function attachTelemetry(engine: AudioEngine, onsets?: TelemetryOnsets): () => void {
    if (!import.meta.env.DEV) return () => {};
    detach();
    const current: Recorder = { engine, raw: undefined, post: undefined, onsets, unsubscribe: () => {} };
    recorder = current;
    current.unsubscribe = engine.subscribe(() => bindTaps(current));
    bindTaps(current);
    allocate();

    window.__vizTelemetry = {
        get columns() {
            return columns;
        },
        get rowCount() {
            return rowCount;
        },
        get overflowed() {
            return overflowed;
        },
        snapshot: () => rows.slice(0, rowCount * columns.length),
        reset: resetRows,
        playback: () => {
            const playback = getActivePlayback();
            return playback
                ? { position: playback.position(), duration: playback.duration, ended: playback.ended }
                : null;
        },
        seek: (seconds) => getActivePlayback()?.seek(seconds),
        normalize: () => engine.getNormalize(),
        setNormalize: (enabled) => engine.setNormalize(enabled),
    };

    return () => {
        if (recorder === current) detach();
    };
}

// For the overlay: a live view of the rows, or undefined when nothing is attached.
export function getTelemetryView(): TelemetryView | undefined {
    if (!import.meta.env.DEV || !recorder) return undefined;
    return { columns, rows, rowCount };
}

export function telemetryProbeCount(): number {
    return probes.length;
}

// Called when a probe registers or unregisters, so the overlay can show or hide itself.
export function subscribeTelemetryProbes(listener: () => void): () => void {
    probeListeners.add(listener);
    return () => {
        probeListeners.delete(listener);
    };
}

function detach(): void {
    const current = recorder;
    if (!current) return;
    recorder = undefined;
    current.unsubscribe();
    disconnectTap(current.raw);
    disconnectTap(current.post);
    delete window.__vizTelemetry;
    rows = new Float32Array(0);
    capacityRows = 0;
    rowCount = 0;
    overflowed = false;
}

// The column layout changed: start over, since old rows no longer line up.
function layoutChanged(): void {
    columns = [...BASE_COLUMNS];
    for (const probe of probes) {
        for (const column of probe.columns) columns.push(`${probe.name}.${column}`);
    }
    if (recorder) allocate();
    probeListeners.forEach((listener) => listener());
}

function allocate(): void {
    capacityRows = Math.max(1, Math.ceil(capacitySeconds * ROWS_PER_SECOND));
    rows = new Float32Array(capacityRows * columns.length);
    rowCount = 0;
    overflowed = false;
}

function resetRows(seconds?: number): void {
    if (seconds !== undefined && Number.isFinite(seconds) && seconds > 0) {
        capacitySeconds = seconds;
        allocate();
        return;
    }
    rowCount = 0;
    overflowed = false;
}

// Reconnects the two analysers when the engine's graph (and with it the audio context) changed.
function bindTaps(current: Recorder): void {
    const input = current.engine.getInputNode();
    const output = current.engine.getAnalyser();
    if (current.raw?.node !== input) {
        disconnectTap(current.raw);
        current.raw = input ? createTap(input) : undefined;
    }
    if (current.post?.node !== output) {
        disconnectTap(current.post);
        current.post = output ? createTap(output) : undefined;
    }
}

function createTap(node: AudioNode): BassTap {
    const analyser = node.context.createAnalyser();
    analyser.fftSize = BASS_FFT_SIZE;
    analyser.smoothingTimeConstant = 0;
    node.connect(analyser);
    const binHz = node.context.sampleRate / BASS_FFT_SIZE;
    return {
        node,
        analyser,
        bytes: new Uint8Array(analyser.frequencyBinCount),
        binCount: Math.max(1, Math.floor(BASS_CUTOFF_HZ / binHz)),
    };
}

function disconnectTap(tap: BassTap | undefined): void {
    if (!tap) return;
    try {
        tap.node.disconnect(tap.analyser);
    } catch {
        // Already disconnected: the node's audio context was closed when the capture stopped.
    }
    try {
        tap.analyser.disconnect();
    } catch {
        // Same: nothing left to disconnect.
    }
}

// Mean frequency magnitude (0..1) over the bins up to the bass cutoff.
function readBass(tap: BassTap): number {
    tap.analyser.getByteFrequencyData(tap.bytes);
    let sum = 0;
    for (let i = 0; i < tap.binCount; i++) sum += tap.bytes[i];
    return sum / tap.binCount / 255;
}
