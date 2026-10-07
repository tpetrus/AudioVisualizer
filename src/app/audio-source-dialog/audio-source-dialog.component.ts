import { Component, EventEmitter, HostListener, OnDestroy, OnInit, Output } from "@angular/core";
import { Subscription } from "rxjs";
import { AudioService } from "../services/audio.service";

// Modal for choosing the audio source. It can't be dismissed until a source is capturing.
@Component({
  selector: 'app-audio-source-dialog',
  templateUrl: './audio-source-dialog.component.html',
  styleUrls: ['./audio-source-dialog.component.scss']
})
export class AudioSourceDialogComponent implements OnInit, OnDestroy {
  @Output() closed = new EventEmitter<void>();

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
      this.level = this._audioService.getLevel();
      if (this.level > 0.01) {
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
