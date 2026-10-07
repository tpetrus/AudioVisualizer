import { Injectable } from "@angular/core";
import { BehaviorSubject, Observable } from "rxjs";
import { delay, filter } from "rxjs/operators";

export type AudioSourceMode = 'screen' | 'device';

interface SavedSource {
    mode: AudioSourceMode;
    deviceId?: string;
}

const STORAGE_KEY = 'audioVisualizer.source';

@Injectable({
    providedIn: 'root'
})
export class AudioService {
    private audioStream: MediaStream | undefined;
    private audioContext: AudioContext | undefined;
    private analyser: AnalyserNode | undefined;
    private source: MediaStreamAudioSourceNode | undefined;
    private analyser$ = new BehaviorSubject<AnalyserNode | undefined>(undefined);
    private meter: AnalyserNode | undefined;
    private meterData = new Uint8Array(1024);
    private resumePromise: Promise<boolean> | undefined;

    public get isCapturing(): boolean {
      return !!this.analyser;
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
  public getLevel(): number {
    if (!this.meter) {
      return 0;
    }
    this.meter.getByteTimeDomainData(this.meterData);
    let peak = 0;
    for (const v of this.meterData) {
      peak = Math.max(peak, Math.abs(v - 128));
    }
    return peak / 128;
  }

  public get trackInfo(): string {
    const track = this.audioStream?.getAudioTracks()[0];
    return track ? `${track.label} (${track.readyState}${track.muted ? ', muted' : ''})` : '';
  }

  public stopCapture(): void {
      this.audioStream?.getTracks().forEach(track => track.stop());
      this.source?.disconnect();
      this.audioContext?.close();
      this.audioStream = this.audioContext = this.source = this.analyser = this.meter = undefined;
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
      this.source.connect(this.analyser);
      this.meter = this.audioContext.createAnalyser();
      this.meter.fftSize = 1024;
      this.source.connect(this.meter);
      this.analyser$.next(this.analyser);
    }

    private saveSource(source: SavedSource): void {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(source));
      } catch { }
    }
}
