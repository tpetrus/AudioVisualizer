import { Injectable } from "@angular/core";
import { BehaviorSubject, Observable } from "rxjs";
import { delay, filter } from "rxjs/operators";

export type AudioSourceMode = 'screen' | 'device';

interface SavedSource {
    mode: AudioSourceMode;
    deviceId?: string;
}

const STORAGE_KEY = 'audioVisualizer.source';
const NORMALIZE_KEY = 'audioVisualizer.normalize';

const NORMALIZE_SETTINGS_KEY = 'audioVisualizer.normalizeSettings';
const AGC_INTERVAL_MS = 30;
const ATTACK_TIME_CONSTANT = 0.02;
const MIN_GAIN = 0.25;

// Automatic gain control tuning.
export interface NormalizeSettings {
    targetPeak: number;      // desired peak level, 0..1 of full scale
    maxGain: number;         // never amplify more than this
    peakHold: number;        // seconds for the measured peak to halve once the audio gets quieter
    releaseTime: number;     // seconds the gain takes to rise when the audio gets quieter
    noiseFloor: number;      // inputs quieter than this (0..1) are treated as silence and not amplified
}

export const DEFAULT_NORMALIZE_SETTINGS: NormalizeSettings = {
    targetPeak: 0.7,
    maxGain: 16,
    peakHold: 3,
    releaseTime: 0.4,
    noiseFloor: 0.004
};

@Injectable({
    providedIn: 'root'
})
export class AudioService {
    private audioStream: MediaStream | undefined;
    private audioContext: AudioContext | undefined;
    private analyser: AnalyserNode | undefined;
    private source: MediaStreamAudioSourceNode | undefined;
    private analyser$ = new BehaviorSubject<AnalyserNode | undefined>(undefined);
    private gainNode: GainNode | undefined;
    private agcTimer?: number;
    private envelope = 0;
    private normalizeSettings: NormalizeSettings = this.loadNormalizeSettings();
    private meter: AnalyserNode | undefined;
    private outputMeter: AnalyserNode | undefined;
    private meterData = new Uint8Array(1024);
    private resumePromise: Promise<boolean> | undefined;

    public get isCapturing(): boolean {
      return !!this.analyser;
    }

    public get normalize(): boolean {
      try {
        return localStorage.getItem(NORMALIZE_KEY) !== 'false';
      } catch {
        return true;
      }
    }

    public set normalize(enabled: boolean) {
      try {
        localStorage.setItem(NORMALIZE_KEY, String(enabled));
      } catch { }
      if (!enabled) {
        this.gainNode?.gain.setTargetAtTime(1, this.audioContext!.currentTime, 0.05);
      }
    }

    public get normalizeOptions(): NormalizeSettings {
      return { ...this.normalizeSettings };
    }

    public updateNormalizeOptions(changes: Partial<NormalizeSettings>): void {
      this.normalizeSettings = { ...this.normalizeSettings, ...changes };
      try {
        localStorage.setItem(NORMALIZE_SETTINGS_KEY, JSON.stringify(this.normalizeSettings));
      } catch { }
    }

    public resetNormalizeOptions(): void {
      this.normalizeSettings = { ...DEFAULT_NORMALIZE_SETTINGS };
      try {
        localStorage.removeItem(NORMALIZE_SETTINGS_KEY);
      } catch { }
    }

    public get savedSource(): SavedSource | undefined {
      try {
        return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null') ?? undefined;
      } catch {
        return undefined;
      }
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
      if (this.isCapturing) {
        return Promise.resolve(true);
      }

      this.resumePromise ??= this.tryResume().finally(() => this.resumePromise = undefined);
      return this.resumePromise;
    }

    // Current peak level (0..1) of the incoming audio, for the signal meter. Uses its own analyser so it
  // doesn't depend on the visualizations' fftSize/smoothing settings.
  // Peak level (0..1) of the incoming audio, before normalization.
  public getLevel(): number {
    return this.readPeak(this.meter);
  }

  // Peak level (0..1) the visualizations actually receive, after normalization.
  public getOutputLevel(): number {
    return this.readPeak(this.outputMeter);
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
    if (!this.gainNode || !this.audioContext || !this.normalize) {
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
    const timeConstant = wanted < this.gainNode.gain.value ? ATTACK_TIME_CONSTANT : releaseTime;
    this.gainNode.gain.setTargetAtTime(wanted, this.audioContext.currentTime, timeConstant);
  }

  public get trackInfo(): string {
    const track = this.audioStream?.getAudioTracks()[0];
    return track ? `${track.label} (${track.readyState}${track.muted ? ', muted' : ''})` : '';
  }

  public stopCapture(): void {
      clearInterval(this.agcTimer);
      this.envelope = 0;
      this.audioStream?.getTracks().forEach(track => track.stop());
      this.source?.disconnect();
      this.audioContext?.close();
      this.audioStream = this.audioContext = this.source = this.analyser = this.meter = this.outputMeter = this.gainNode = undefined;
      this.analyser$.next(undefined);
    }

    public forgetSavedSource(): void {
      try {
        localStorage.removeItem(STORAGE_KEY);
      } catch { }
    }

    public getAnalyser(): Observable<AnalyserNode> {
      // Delay so subscribers (which build their scene in the constructor) run after their view has rendered.
      return this.analyser$.pipe(filter((analyser): analyser is AnalyserNode => !!analyser), delay(0));
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
      this.stopCapture();
      this.audioStream = stream;
      this.audioContext = new AudioContext();
      // Contexts created outside a user gesture (e.g. on page load) start suspended and would read silence.
      await this.audioContext.resume();
      this.analyser = this.audioContext.createAnalyser();
      this.source = this.audioContext.createMediaStreamSource(new MediaStream(stream.getAudioTracks()));
      this.gainNode = this.audioContext.createGain();
      this.source.connect(this.gainNode);
      this.gainNode.connect(this.analyser);
      this.meter = this.audioContext.createAnalyser();
      this.meter.fftSize = 1024;
      this.source.connect(this.meter);
      this.outputMeter = this.audioContext.createAnalyser();
      this.outputMeter.fftSize = 1024;
      this.gainNode.connect(this.outputMeter);
      this.agcTimer = window.setInterval(() => this.updateGain(), AGC_INTERVAL_MS);
      this.analyser$.next(this.analyser);
    }

    private loadNormalizeSettings(): NormalizeSettings {
      try {
        return { ...DEFAULT_NORMALIZE_SETTINGS, ...JSON.parse(localStorage.getItem(NORMALIZE_SETTINGS_KEY) ?? '{}') };
      } catch {
        return { ...DEFAULT_NORMALIZE_SETTINGS };
      }
    }

    private saveSource(source: SavedSource): void {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(source));
      } catch { }
    }
}
