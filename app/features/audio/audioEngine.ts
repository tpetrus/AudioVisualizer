import { clearNormalizeSettings, clearSource, loadNormalize, loadNormalizeSettings, loadSource, saveNormalizeSettings, saveSource, setNormalize } from "./storage";
import { DEFAULT_AUDIO_GRAPH, DEFAULT_NORMALIZE_SETTINGS, type AudioGraph, type NormalizeSettings, type SavedSource } from "./types";

const AGC_INTERVAL_MS = 30;
const ATTACK_TIME_CONSTANT = 0.02;
const MIN_GAIN = 0.25;

export class AudioEngine {
    private graph: AudioGraph = DEFAULT_AUDIO_GRAPH;
    private agcTimer?: number;
    private envelope = 0;
    private normalizeSettings: NormalizeSettings = this.loadNormalizeSettings();
    private normalize: boolean;
    private meterData = new Uint8Array(1024);
    private resumePromise: Promise<boolean> | undefined;

    private listeners = new Set<() => void>();
    readonly subscribe = (listener: () => void): (() => void) => {
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
    }

    public getAnalyser = () => this.graph.analyser;
    public getIsCapturing = () => !!this.graph.analyser;
    public getNormalizeOptions = () => this.normalizeSettings;
    public getNormalize = () => this.normalize;

    constructor() {
        this.normalize = loadNormalize();
    }

    public setNormalize(enabled: boolean) {
        setNormalize(enabled);
        this.notify();
        if (!enabled) {
            this.graph.gainNode?.gain.setTargetAtTime(1, this.graph.audioContext!.currentTime, 0.05);
        }
    }

    public updateNormalizeOptions(changes: Partial<NormalizeSettings>): void {
        this.normalizeSettings = { ...this.normalizeSettings, ...changes };
        saveNormalizeSettings(this.normalizeSettings);
        this.notify();
    }

    public resetNormalizeOptions(): void {
        this.normalizeSettings = { ...DEFAULT_NORMALIZE_SETTINGS };
        this.notify();
        clearNormalizeSettings();
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
        this.saveSource({ mode: 'screen' });
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
        this.saveSource({ mode: 'device', deviceId });
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

    // Current peak level (0..1) of the incoming audio, for the signal meter. Uses its own analyser so it
    // doesn't depend on the visualizations' fftSize/smoothing settings.
    // Peak level (0..1) of the incoming audio, before normalization.
    public getLevel(): number {
        return this.readPeak(this.graph.meter);
    }

    // Peak level (0..1) the visualizations actually receive, after normalization.
    public getOutputLevel(): number {
        return this.readPeak(this.graph.outputMeter);
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
        if (!this.graph.gainNode || !this.graph.audioContext || !this.normalize) {
            return;
        }

        const { targetPeak, maxGain, peakHold, releaseTime, noiseFloor } = this.normalizeSettings;
        // Per-tick decay that halves the envelope every `peakHold` seconds.
        const decay = Math.pow(0.5, AGC_INTERVAL_MS / 1000 / peakHold);

        this.envelope = Math.max(this.getLevel(), this.envelope * decay);
        if (this.envelope < noiseFloor) {
            return; // don't amplify silence or noise
        }

        const wanted = Math.min(maxGain, Math.max(MIN_GAIN, targetPeak / this.envelope));
        // Fast attack when too loud, slower release when too quiet, to avoid pumping.
        const timeConstant = wanted < this.graph.gainNode.gain.value ? ATTACK_TIME_CONSTANT : releaseTime;
        this.graph.gainNode.gain.setTargetAtTime(wanted, this.graph.audioContext.currentTime, timeConstant);
    }

    // Latencies the browser reports, in ms. Time spent in the OS capture pipeline (e.g. screen-share buffering)
    // is not visible to the page, so captureLatencyMs is only available when the track reports it.
    public get latencyInfo(): { sampleRate?: number; baseLatencyMs?: number; outputLatencyMs?: number; captureLatencyMs?: number; analysisWindowMs?: number } {
        const context = this.graph.audioContext;
        if (!context) {
            return {};
        }
        const trackLatency = (this.graph.audioStream?.getAudioTracks()[0]?.getSettings() as MediaTrackSettings & { latency?: number })?.latency;
        return {
            sampleRate: context.sampleRate,
            baseLatencyMs: context.baseLatency * 1000,
            outputLatencyMs: (context as AudioContext & { outputLatency?: number }).outputLatency !== undefined
                ? (context as AudioContext & { outputLatency: number }).outputLatency * 1000 : undefined,
            captureLatencyMs: trackLatency !== undefined ? trackLatency * 1000 : undefined,
            analysisWindowMs: this.graph.analyser ? this.graph.analyser.fftSize / context.sampleRate * 1000 : undefined
        };
    }

    public get trackInfo(): string {
        const track = this.graph.audioStream?.getAudioTracks()[0];
        return track ? `${track.label} (${track.readyState}${track.muted ? ', muted' : ''})` : '';
    }

    public teardown(): void {
        clearInterval(this.agcTimer);
        this.envelope = 0;
        this.graph.audioStream?.getTracks().forEach(track => track.stop());
        this.graph.source?.disconnect();
        this.graph.audioContext?.close();
        this.graph = DEFAULT_AUDIO_GRAPH;
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

    private async connect(stream: MediaStream): Promise<void> {
        this.teardown();
        this.graph.audioStream = stream;
        this.graph.audioContext = new AudioContext();
        // Contexts created outside a user gesture (e.g. on page load) start suspended and would read silence.
        await this.graph.audioContext.resume();
        this.graph.analyser = this.graph.audioContext.createAnalyser();
        this.graph.source = this.graph.audioContext.createMediaStreamSource(new MediaStream(stream.getAudioTracks()));
        this.graph.gainNode = this.graph.audioContext.createGain();
        this.graph.source.connect(this.graph.gainNode);
        this.graph.gainNode.connect(this.graph.analyser);
        this.graph.meter = this.graph.audioContext.createAnalyser();
        this.graph.meter.fftSize = 1024;
        this.graph.source.connect(this.graph.meter);
        this.graph.outputMeter = this.graph.audioContext.createAnalyser();
        this.graph.outputMeter.fftSize = 1024;
        this.graph.gainNode.connect(this.graph.outputMeter);
        this.agcTimer = window.setInterval(() => this.updateGain(), AGC_INTERVAL_MS);
        this.notify();
    }

    private loadNormalizeSettings(): NormalizeSettings {
        return loadNormalizeSettings();
    }

    private saveSource(source: SavedSource): void {
        saveSource(source)
    }

    private notify(): void {
        const listenersCopy = [...this.listeners];
        listenersCopy.forEach(l => {
            try {
                l();
            }
            catch {

            }
        })
    }
}

export const audioEngine = new AudioEngine();