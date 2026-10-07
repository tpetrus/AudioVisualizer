import { Component, EventEmitter, HostListener, OnDestroy, OnInit, Output } from "@angular/core";
import { Subscription } from "rxjs";
import { AudioService, NormalizeSettings } from "../services/audio.service";

interface NormalizeSlider {
  key: keyof NormalizeSettings;
  label: string;
  help: string;
  min: number;
  max: number;
  step: number;
  unit: string;
}

// Modal for choosing the audio source. It can't be dismissed until a source is capturing.
@Component({
  selector: 'app-audio-source-dialog',
  templateUrl: './audio-source-dialog.component.html',
  styleUrls: ['./audio-source-dialog.component.scss']
})
export class AudioSourceDialogComponent implements OnInit, OnDestroy {
  @Output() closed = new EventEmitter<void>();

  public readonly sliders: NormalizeSlider[] = [
    { key: 'targetPeak', label: 'Target level', min: 0.2, max: 1, step: 0.05, unit: '',
      help: 'How loud the audio is scaled to. Higher makes the visualization bigger overall.' },
    { key: 'maxGain', label: 'Maximum boost', min: 1, max: 32, step: 1, unit: 'x',
      help: 'Upper limit on amplification. Lower it if quiet sources get too noisy.' },
    { key: 'peakHold', label: 'Peak memory', min: 0.5, max: 10, step: 0.5, unit: ' s',
      help: 'How long a loud moment keeps the volume turned down. Longer is steadier; shorter reacts faster.' },
    { key: 'releaseTime', label: 'Recovery time', min: 0.05, max: 2, step: 0.05, unit: ' s',
      help: 'How quickly the volume comes back up after quiet passages. Shorter can sound pumpy.' },
    { key: 'noiseFloor', label: 'Noise floor', min: 0, max: 0.05, step: 0.001, unit: '',
      help: 'Input quieter than this counts as silence and is not boosted.' }
  ];
  public normalizeOptions: NormalizeSettings = this._audioService.normalizeOptions;

  public busy = false;
  public captureError = '';
  public devices: MediaDeviceInfo[] = [];
  public selectedDeviceId = '';
  public showChooser = false;

  public level = 0;
  public silent = false;
  public trackInfo = '';
  private meterTimer?: number;
  private silentSince = 0;
  private subscription?: Subscription;


  constructor(private readonly _audioService: AudioService) { }

  public get canClose(): boolean {
    return this._audioService.isCapturing;
  }

  public get normalize(): boolean {
    return this._audioService.normalize;
  }

  public onSliderInput(key: keyof NormalizeSettings, event: Event): void {
    this._audioService.updateNormalizeOptions({ [key]: +(event.target as HTMLInputElement).value });
    this.normalizeOptions = this._audioService.normalizeOptions;
  }

  public resetNormalizeOptions(): void {
    this._audioService.resetNormalizeOptions();
    this.normalizeOptions = this._audioService.normalizeOptions;
  }

  public onNormalizeChange(event: Event): void {
    this._audioService.normalize = (event.target as HTMLInputElement).checked;
  }

  ngOnInit(): void {
    if (this._audioService.isCapturing) {
      this.startMeter();
    }
    // Emits whenever a source (re)connects, including when the user switches sources.
    this.subscription = this._audioService.getAnalyser().subscribe(() => {
      this.showChooser = false;
      this.startMeter();
    });
  }

  public async startScreenCapture() {
    await this.run(() => this._audioService.startScreenCapture());
  }

  public async loadDevices() {
    await this.run(async () => {
      this.devices = await this._audioService.getInputDevices();
      const saved = this._audioService.savedSource?.deviceId;
      this.selectedDeviceId = this.devices.find(d => d.deviceId === saved)?.deviceId ?? this.devices[0]?.deviceId ?? '';
      if (!this.devices.length) {
        throw new Error('No audio input devices were found.');
      }
    });
  }

  public async startDeviceCapture() {
    await this.run(() => this._audioService.startDeviceCapture(this.selectedDeviceId));
  }

  public onDeviceSelected(event: Event) {
    this.selectedDeviceId = (event.target as HTMLSelectElement).value;
  }

  public close(): void {
    if (this.canClose) {
      this.closed.emit();
    }
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    this.close();
  }

  private startMeter() {
    clearInterval(this.meterTimer);
    this.silentSince = Date.now();
    this.silent = false;
    this.trackInfo = this._audioService.trackInfo;
    this.meterTimer = window.setInterval(() => {
      this.level = this._audioService.getOutputLevel();
      // Silence is judged on the raw input so amplified noise can't hide a dead source.
      if (this._audioService.getLevel() > 0.01) {
        this.silentSince = Date.now();
      }
      this.silent = Date.now() - this.silentSince > 4000;
    }, 100);
  }

  private async run(action: () => Promise<void>) {
    this.captureError = '';
    this.busy = true;
    try {
      await action();
    } catch (e) {
      this.captureError = e instanceof Error ? e.message : 'Unable to capture audio.';
    } finally {
      this.busy = false;
    }
  }

  ngOnDestroy(): void {
    clearInterval(this.meterTimer);
    this.subscription?.unsubscribe();
  }
}
