import { clearNormalizeSettings, clearSource, loadNormalize, loadNormalizeSettings, loadSource, saveNormalize, saveNormalizeSettings, saveSource } from "./storage";
import { DEFAULT_NORMALIZE_SETTINGS, type AudioGraph, type NormalizeSettings, type SavedSource } from "./types";

const AGC_INTERVAL_MS = 30;
const ATTACK_TIME_CONSTANT = 0.02;
const MIN_GAIN = 0.25;
const METER_FFT_SIZE = 1024;

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

    private readonly listeners = new Set<() => void>();
    readonly subscribe = (listener: () => void): (() => void) => {
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
    }

    // Snapshot getters for useSyncExternalStore: arrow properties so `this` survives being passed around, and each
    // returns the same value (same reference) until something changes.
    public getAnalyser = () => this.graph?.analyser;
    public getIsCapturing = () => this.graph !== undefined;
    public getNormalizeOptions = () => this.normalizeSettings;
    public getNormalize = () => this.normalize;

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
            stream.getTracks().forEach(track => track.stop());
            throw new Error('No audio was shared. Choose a screen or tab and enable "Share system audio".');
        }

        // Only audio is needed; drop the video track.
        stream.getVideoTracks().forEach(track => track.stop());
        await this.connect(stream);
        saveSource({ mode: 'screen' });
    }

    // Captures an audio input device (microphone, Stereo Mix, virtual cable, ...). The browser remembers the permission.
    public async startDeviceCapture(deviceId: string): Promise<void> {
        const stream = await navigator.mediaDevices.getUserMedia({
            audio: {
                deviceId: { exact: deviceId },
                // Processing meant for voice calls would mangle music.
                echoCancellation: false,
                noiseSuppression: false,
                autoGainControl: false
            },
            video: false
        });
        await this.connect(stream);
        saveSource({ mode: 'device', deviceId });
    }

    // Lists audio input devices. Labels are only available once permission has been granted.
    public async getInputDevices(): Promise<MediaDeviceInfo[]> {
        const probe = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
        probe.getTracks().forEach(track => track.stop());

        const devices = await navigator.mediaDevices.enumerateDevices();
        return devices.filter(device => device.kind === 'audioinput' && device.deviceId !== 'communications');
    }

    // Restores a previously used input device without any prompt. Screen capture can't be restored.
    public resumeSavedSource(): Promise<boolean> {
        if (this.getIsCapturing()) {
            return Promise.resolve(true);
        }

        this.resumePromise ??= this.tryResume().finally(() => this.resumePromise = undefined);
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
    public get latencyInfo(): { sampleRate?: number; baseLatencyMs?: number; outputLatencyMs?: number; captureLatencyMs?: number; analysisWindowMs?: number } {
        if (!this.graph) {
            return {};
        }
        const { audioContext: context, audioStream, analyser } = this.graph;
        const trackLatency = (audioStream.getAudioTracks()[0]?.getSettings() as MediaTrackSettings & { latency?: number })?.latency;
        return {
            sampleRate: context.sampleRate,
            baseLatencyMs: context.baseLatency * 1000,
            outputLatencyMs: (context as AudioContext & { outputLatency?: number }).outputLatency !== undefined
                ? (context as AudioContext & { outputLatency: number }).outputLatency * 1000 : undefined,
            captureLatencyMs: trackLatency !== undefined ? trackLatency * 1000 : undefined,
            analysisWindowMs: analyser.fftSize / context.sampleRate * 1000
        };
    }

    public get trackInfo(): string {
        const track = this.graph?.audioStream.getAudioTracks()[0];
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
            const permission = await navigator.permissions.query({ name: 'microphone' as PermissionName });
            if (permission.state !== 'granted') {
                return false;
            }
            await this.startDeviceCapture(saved.deviceId);
            return true;
        } catch {
            return false;
        }
    }

    // Replaces any current capture with `stream`. The new graph is built before the old one is torn down, so
    // subscribers go straight from the old analyser to the new one and never see an "undefined" state.
    private async connect(stream: MediaStream): Promise<void> {
        const audioContext = new AudioContext();
        // Contexts created outside a user gesture (e.g. on page load) start suspended and would read silence.
        await audioContext.resume();

        const source = audioContext.createMediaStreamSource(new MediaStream(stream.getAudioTracks()));
        const gainNode = audioContext.createGain();
        const analyser = audioContext.createAnalyser();
        const meter = audioContext.createAnalyser();
        meter.fftSize = METER_FFT_SIZE;
        const outputMeter = audioContext.createAnalyser();
        outputMeter.fftSize = METER_FFT_SIZE;

        source.connect(gainNode);
        gainNode.connect(analyser);
        source.connect(meter);
        gainNode.connect(outputMeter);

        this.teardown();
        this.graph = { audioStream: stream, audioContext, source, gainNode, analyser, meter, outputMeter };
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
        const { audioStream, source, audioContext } = this.graph;
        this.graph = undefined;
        audioStream.getTracks().forEach(track => track.stop());
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

export const audioEngine = new AudioEngine();
