import { Component, NgZone, OnDestroy, OnInit } from "@angular/core";
import { AudioService } from "../services/audio.service";

// Debug overlay: separates rendering cost (frame pacing) from audio-path latency.
@Component({
  selector: 'app-perf-stats',
  template: `
    <div class="stats">
      <div><b>Rendering</b></div>
      <div>GPU: {{ gpu }}</div>
      <div>{{ fps }} fps · avg {{ avgFrameMs }} ms</div>
      <div>worst frame {{ worstFrameMs }} ms · slow frames (&gt;25 ms, last 0.5 s): {{ slowFrames }}</div>
      <div class="mt"><b>Audio</b></div>
      <div>sample rate {{ audio.sampleRate || '–' }} Hz</div>
      <div>context latency {{ fmt(audio.baseLatencyMs) }} · output {{ fmt(audio.outputLatencyMs) }}</div>
      <div>capture latency {{ fmt(audio.captureLatencyMs) }}</div>
      <div>analysis window {{ fmt(audio.analysisWindowMs) }}</div>
    </div>
  `,
  styles: [`
    .stats { position: fixed; left: 12px; bottom: 12px; z-index: 10; color: #9f9; background: rgba(0, 0, 0, .75);
      font: 12px monospace; padding: 8px 10px; border-radius: 6px; pointer-events: none; }
    .mt { margin-top: 6px; }
  `]
})
export class PerfStatsComponent implements OnInit, OnDestroy {
  public fps = 0;
  public avgFrameMs = '0';
  public worstFrameMs = '0';
  public slowFrames = 0;
  public gpu = PerfStatsComponent.describeGpu();
  public audio = this._audioService.latencyInfo;

  private frameId = 0;
  private timer?: number;
  private lastFrame = 0;
  private frames = 0;
  private totalMs = 0;
  private worstMs = 0;
  private slow = 0;

  constructor(private readonly _audioService: AudioService, private readonly _zone: NgZone) { }

  // Software renderers (SwiftShader, llvmpipe, Microsoft Basic Render) mean hardware acceleration isn't working.
  private static describeGpu(): string {
    const gl = document.createElement('canvas').getContext('webgl2') ?? document.createElement('canvas').getContext('webgl');
    if (!gl) {
      return 'WebGL unavailable';
    }
    const info = gl.getExtension('WEBGL_debug_renderer_info');
    return info ? String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL)) : 'unknown';
  }

  public fmt(ms: number | undefined): string {
    return ms === undefined ? 'n/a' : `${ms.toFixed(1)} ms`;
  }

  ngOnInit(): void {
    // Sample frame pacing outside Angular so the overlay doesn't trigger change detection every frame.
    this._zone.runOutsideAngular(() => {
      const tick = (now: number) => {
        if (this.lastFrame) {
          const delta = now - this.lastFrame;
          this.frames++;
          this.totalMs += delta;
          this.worstMs = Math.max(this.worstMs, delta);
          if (delta > 25) {
            this.slow++;
          }
        }
        this.lastFrame = now;
        this.frameId = requestAnimationFrame(tick);
      };
      this.frameId = requestAnimationFrame(tick);
    });

    this.timer = window.setInterval(() => {
      if (this.frames) {
        this.fps = Math.round(1000 / (this.totalMs / this.frames));
        this.avgFrameMs = (this.totalMs / this.frames).toFixed(1);
        this.worstFrameMs = this.worstMs.toFixed(1);
        this.slowFrames = this.slow;
      }
      this.frames = this.totalMs = this.worstMs = this.slow = 0;
      this.audio = this._audioService.latencyInfo;
    }, 500);
  }

  ngOnDestroy(): void {
    cancelAnimationFrame(this.frameId);
    clearInterval(this.timer);
  }
}
