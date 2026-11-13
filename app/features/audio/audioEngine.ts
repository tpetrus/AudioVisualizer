import {
    clearNormalizeSettings,
    clearSource,
    loadNormalize,
    loadNormalizeSettings,
    loadSource,
    saveNormalize,
    saveNormalizeSettings,
    saveSource,
} from './storage';
import {
    assignAnalyserSettings,
    DEFAULT_NORMALIZE_SETTINGS,
    ENGINE_TAP_SETTINGS,
    type AnalyserSettings,
    type AudioGraph,
    type OwnedAnalyser,
    type NormalizeSettings,
    type SavedSource,
    type SourceInput,
    type SourceOpener,
} from './types';

const AGC_INTERVAL_MS = 30;
const ATTACK_TIME_CONSTANT = 0.02;
const MIN_GAIN = 0.25;
const METER_FFT_SIZE = 1024;

const ANALYSER_KEYS = ['fftSize', 'smoothingTimeConstant', 'minDecibels', 'maxDecibels'] as const;

const readSettings = (node: AnalyserNode): AnalyserSettings => ({
    fftSize: node.fftSize,
    smoothingTimeConstant: node.smoothingTimeConstant,
    minDecibels: node.minDecibels,
    maxDecibels: node.maxDecibels,
});

// Makes the tap's settings read-only for everyone: it is shared, so a write from one reader would change what all the
// others see. The node keeps the values applied before this call.
const lockTapSettings = (tap: AnalyserNode): void => {
    for (const key of ANALYSER_KEYS) {
        Object.defineProperty(tap, key, {
            configurable: false,
            enumerable: true,
            get: () => ENGINE_TAP_SETTINGS[key],
            set: () => {
                throw new TypeError(
                    `The engine's shared analyser is read-only (tried to set ${key}). Use useAnalyser(options) to get a node with your own settings.`,
                );
            },
        });
    }
};

// One consumer's analyser. `node` is undefined while nothing is captured; `settings` remembers the last known
// settings so a later capture rebuilds the node the way its owner left it.
interface OwnedEntry {
    settings: AnalyserSettings;
    node?: AnalyserNode;
    // The gain node feeding `node`, kept so the connection into the node can be removed again.
    feed?: GainNode;
}

// Captures audio, normalizes its volume, and exposes the analyser the visualizations read. Framework-free: React
// reads it through `subscribe` + the arrow-property getters (see useAudioState.ts).
export class AudioEngine {
    // A complete graph while capturing, undefined otherwise.
    private graph: AudioGraph | undefined;
    private agcTimer?: number;
    private envelope = 0;
    private normalizeSettings: NormalizeSettings = loadNormalizeSettings();
    private normalize: boolean = loadNormalize();
    private readonly meterData = new Uint8Array(METER_FFT_SIZE);
    private resumePromise: Promise<boolean> | undefined;

    private readonly ownedAnalysers = new Set<OwnedEntry>();

    private readonly listeners = new Set<() => void>();
    readonly subscribe = (listener: () => void): (() => void) => {
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
    };

    // Snapshot getters for useSyncExternalStore: arrow properties so `this` survives being passed around, and each
    // returns the same value (same reference) until something changes.
    public getAnalyser = () => this.graph?.analyser;
    // A node of the consumer's own, fed from the same point as the tap and carrying exactly the settings it declares.
    // The consumer may assign new settings on it at any time. The engine rebuilds it when the source changes.
    public acquireAnalyser(settings: AnalyserSettings): OwnedAnalyser {
        const entry: OwnedEntry = { settings: { ...settings } };
        this.ownedAnalysers.add(entry);
        if (this.graph) {
            this.buildOwnedNode(entry, this.graph);
        }
        return {
            getNode: () => entry.node,
            release: () => {
                this.ownedAnalysers.delete(entry);
                this.disconnectOwnedNode(entry);
            },
        };
    }

    private buildOwnedNode(entry: OwnedEntry, graph: AudioGraph): void {
        const node = graph.audioContext.createAnalyser();
        assignAnalyserSettings(node, entry.settings);
        graph.gainNode.connect(node);
        entry.node = node;
        entry.feed = graph.gainNode;
    }

    // Keeps the node's current settings in the entry first, so a rebuild reproduces them.
    private disconnectOwnedNode(entry: OwnedEntry): void {
        if (!entry.node) {
            return;
        }
        entry.settings = readSettings(entry.node);
        // `disconnect()` with no argument only removes a node's outgoing connections. The connection from the gain
        // node into it must be removed by name, or the gain node keeps the released analyser alive and processing.
        entry.feed?.disconnect(entry.node);
        entry.node.disconnect();
        entry.node = undefined;
        entry.feed = undefined;
    }

    public getIsCapturing = () => this.graph !== undefined;
    public getNormalizeOptions = () => this.normalizeSettings;
    public getNormalize = () => this.normalize;
    // The source node before the gain stage, and the current AGC gain.
    public getInputNode = () => this.graph?.source;
    public getGain = () => this.graph?.gainNode.gain.value ?? 1;

    public setNormalize(enabled: boolean): void {
        this.normalize = enabled;
        saveNormalize(enabled);
        if (!enabled && this.graph) {
            this.graph.gainNode.gain.setTargetAtTime(1, this.graph.audioContext.currentTime, 0.05);
        }
        this.notify();
    }

    public updateNormalizeOptions(changes: Partial<NormalizeSettings>): void {
        this.normalizeSettings = { ...this.normalizeSettings, ...changes };
        saveNormalizeSettings(this.normalizeSettings);
        this.notify();
    }

    public resetNormalizeOptions(): void {
        this.normalizeSettings = { ...DEFAULT_NORMALIZE_SETTINGS };
        clearNormalizeSettings();
        this.notify();
    }

    public get savedSource(): SavedSource | undefined {
        return loadSource();
    }

    // Captures whatever the computer is playing (system/tab audio). Must be called from a user gesture.
    public async startScreenCapture(): Promise<void> {
        const stream = await navigator.mediaDevices.getDisplayMedia({ audio: true, video: true });
        if (stream.getAudioTracks().length === 0) {
            stream.getTracks().forEach((track) => track.stop());
            throw new Error('No audio was shared. Choose a screen or tab and enable "Share system audio".');
        }

        // Only audio is needed; drop the video track.
        stream.getVideoTracks().forEach((track) => track.stop());
        await this.startStream(stream, { mode: 'screen' });
    }

    // Captures an audio input device (microphone, Stereo Mix, virtual cable, ...). The browser remembers the permission.
    public async startDeviceCapture(deviceId: string): Promise<void> {
        const stream = await navigator.mediaDevices.getUserMedia({
            audio: {
                deviceId: { exact: deviceId },
                // Processing meant for voice calls would mangle music.
                echoCancellation: false,
                noiseSuppression: false,
                autoGainControl: false,
            },
            video: false,
        });
        await this.startStream(stream, { mode: 'device', deviceId });
    }

    // Starts a granted stream and remembers it. If starting fails nobody else holds the stream, so stop its tracks
    // here; otherwise the microphone or the browser's screen-sharing indicator would stay on.
    private async startStream(stream: MediaStream, saved: SavedSource): Promise<void> {
        try {
            await this.startSource(streamOpener(stream));
        } catch (error) {
            stream.getTracks().forEach((track) => track.stop());
            throw error;
        }
        saveSource(saved);
    }

    // Lists audio input devices. Labels are only available once permission has been granted.
    public async getInputDevices(): Promise<MediaDeviceInfo[]> {
        const probe = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
        probe.getTracks().forEach((track) => track.stop());

        const devices = await navigator.mediaDevices.enumerateDevices();
        return devices.filter((device) => device.kind === 'audioinput' && device.deviceId !== 'communications');
    }

    // Restores a previously used input device without any prompt. Screen capture can't be restored.
    public resumeSavedSource(): Promise<boolean> {
        if (this.getIsCapturing()) {
            return Promise.resolve(true);
        }

        this.resumePromise ??= this.tryResume().finally(() => (this.resumePromise = undefined));
        return this.resumePromise;
    }

    // Peak level (0..1) of the incoming audio, before normalization. Uses its own analyser so it doesn't depend on
    // the visualizations' fftSize/smoothing settings.
    public getLevel(): number {
        return this.readPeak(this.graph?.meter);
    }

    // Peak level (0..1) the visualizations actually receive, after normalization.
    public getOutputLevel(): number {
        return this.readPeak(this.graph?.outputMeter);
    }

    private readPeak(meter: AnalyserNode | undefined): number {
        if (!meter) {
            return 0;
        }
        meter.getByteTimeDomainData(this.meterData);
        let peak = 0;
        for (const v of this.meterData) {
            peak = Math.max(peak, Math.abs(v - 128));
        }
        return peak / 128;
    }

    // Nudges the gain so loud and quiet sources produce the same visualization. Measures the raw input
    // (before the gain stage) and tracks a slowly decaying peak envelope.
    private updateGain(): void {
        if (!this.graph || !this.normalize) {
            return;
        }
        const { gainNode, audioContext } = this.graph;

        const { targetPeak, maxGain, peakHold, releaseTime, noiseFloor } = this.normalizeSettings;
        // Per-tick decay that halves the envelope every `peakHold` seconds.
        const decay = Math.pow(0.5, AGC_INTERVAL_MS / 1000 / peakHold);

        this.envelope = Math.max(this.getLevel(), this.envelope * decay);
        if (this.envelope < noiseFloor) {
            return; // don't amplify silence or noise
        }

        const wanted = Math.min(maxGain, Math.max(MIN_GAIN, targetPeak / this.envelope));
        // Fast attack when too loud, slower release when too quiet, to avoid pumping.
        const timeConstant = wanted < gainNode.gain.value ? ATTACK_TIME_CONSTANT : releaseTime;
        gainNode.gain.setTargetAtTime(wanted, audioContext.currentTime, timeConstant);
    }

    // Latencies the browser reports, in ms. Time spent in the OS capture pipeline (e.g. screen-share buffering)
    // is not visible to the page, so captureLatencyMs is only available when the track reports it.
    public get latencyInfo(): {
        sampleRate?: number;
        baseLatencyMs?: number;
        outputLatencyMs?: number;
        captureLatencyMs?: number;
        analysisWindowMs?: number;
    } {
        if (!this.graph) {
            return {};
        }
        const { audioContext: context, input, analyser } = this.graph;
        const trackLatency = (
            input.stream?.getAudioTracks()[0]?.getSettings() as MediaTrackSettings & { latency?: number }
        )?.latency;
        return {
            sampleRate: context.sampleRate,
            baseLatencyMs: context.baseLatency * 1000,
            outputLatencyMs:
                (context as AudioContext & { outputLatency?: number }).outputLatency !== undefined
                    ? (context as AudioContext & { outputLatency: number }).outputLatency * 1000
                    : undefined,
            captureLatencyMs: trackLatency !== undefined ? trackLatency * 1000 : undefined,
            analysisWindowMs: (analyser.fftSize / context.sampleRate) * 1000,
        };
    }

    public get trackInfo(): string {
        const input = this.graph?.input;
        if (!input?.stream) {
            return input?.label ?? '';
        }
        const track = input.stream.getAudioTracks()[0];
        return track ? `${track.label} (${track.readyState}${track.muted ? ', muted' : ''})` : '';
    }

    public stopCapture(): void {
        this.teardown();
        this.notify();
    }

    public forgetSavedSource(): void {
        clearSource();
    }

    private async tryResume(): Promise<boolean> {
        const saved = this.savedSource;
        if (saved?.mode !== 'device' || !saved.deviceId) {
            return false;
        }

        try {
            // Only resume silently when the permission is already granted; never trigger a prompt on page load.
            const permission = await navigator.permissions.query({ name: 'microphone' });
            if (permission.state !== 'granted') {
                return false;
            }
            await this.startDeviceCapture(saved.deviceId);
            return true;
        } catch {
            return false;
        }
    }

    // Replaces any current source with whatever `open` produces. The new graph is built before the old one is torn
    // down, so subscribers go straight from the old analyser to the new one and never see an "undefined" state. If
    // opening fails, the old graph keeps running. Never remembers the source: only the capture methods do that.
    public async startSource(open: SourceOpener): Promise<void> {
        const audioContext = new AudioContext();
        let input: SourceInput | undefined;
        let graph: AudioGraph;
        try {
            // Contexts created outside a user gesture (e.g. on page load) start suspended and would read silence.
            await audioContext.resume();
            input = await open(audioContext);

            const source = input.node;
            const gainNode = audioContext.createGain();
            const analyser = audioContext.createAnalyser();
            assignAnalyserSettings(analyser, ENGINE_TAP_SETTINGS);
            lockTapSettings(analyser);
            const meter = audioContext.createAnalyser();
            meter.fftSize = METER_FFT_SIZE;
            const outputMeter = audioContext.createAnalyser();
            outputMeter.fftSize = METER_FFT_SIZE;

            source.connect(gainNode);
            gainNode.connect(analyser);
            source.connect(meter);
            gainNode.connect(outputMeter);
            graph = { input, audioContext, source, gainNode, analyser, meter, outputMeter };
        } catch (error) {
            // Nothing is installed yet, so this attempt owns the new context and any input it opened; the old graph is
            // untouched. (startStream stops the stream's tracks again, which is harmless.) Close first and swallow a
            // throwing stop so cleanup can neither leak the context nor mask the original error.
            // A rejected close only means the context is already gone; it must not surface as an unhandled rejection.
            void audioContext.close().catch(() => {});
            try {
                input?.stop();
            } catch {
                // Ignored on purpose, see above.
            }
            throw error;
        }

        this.teardown();
        this.graph = graph;
        for (const entry of this.ownedAnalysers) {
            // One consumer's failing rebuild must not leave the source half installed: the others still get their
            // nodes, the capture keeps its timer and subscribers still hear about the new source.
            try {
                this.buildOwnedNode(entry, graph);
            } catch (error) {
                entry.node = undefined;
                entry.feed = undefined;
                console.error('AudioEngine could not rebuild an owned analyser', error);
            }
        }
        this.agcTimer = window.setInterval(() => this.updateGain(), AGC_INTERVAL_MS);
        this.notify();
    }

    // Stops the current capture without notifying (callers decide when subscribers hear about it).
    private teardown(): void {
        clearInterval(this.agcTimer);
        this.envelope = 0;
        if (!this.graph) {
            return;
        }
        const { input, source, audioContext } = this.graph;
        this.graph = undefined;
        for (const entry of this.ownedAnalysers) {
            this.disconnectOwnedNode(entry);
        }
        input.stop();
        source.disconnect();
        void audioContext.close();
    }

    private notify(): void {
        // Copy first: a listener may unsubscribe while we iterate.
        for (const listener of [...this.listeners]) {
            try {
                listener();
            } catch (error) {
                // One failing subscriber must not stop the others from hearing the update.
                console.error('AudioEngine listener failed', error);
            }
        }
    }
}

// Wraps a capture stream as a source: only its audio tracks reach the graph, and stopping frees the whole stream.
const streamOpener =
    (stream: MediaStream): SourceOpener =>
    (context) => ({
        node: context.createMediaStreamSource(new MediaStream(stream.getAudioTracks())),
        stop: () => stream.getTracks().forEach((track) => track.stop()),
        stream,
    });

export const audioEngine = new AudioEngine();
