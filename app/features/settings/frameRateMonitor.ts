export interface FrameRateMonitorOptions {
    thresholdFps: number;
    windowMs: number;
    warmupMs: number;
    maxDtMs: number;
}

// Below this average the enhanced look is visibly choppy, yet a fine standard-mode machine could still hold 60 with
// the plain scene: 40 leaves room for ordinary jitter (a 60 Hz display with a few late frames still averages well
// above it) so the notice only appears when the device really struggles.
const SLOW_THRESHOLD_FPS = 40;
// Long enough to smooth over a single hitch or a garbage collection pause, short enough that a visitor who is
// watching a slideshow is told within a few seconds.
const SLOW_WINDOW_MS = 5000;
// The first seconds after a build or an asset swap are slow for reasons that do not last: shader compiles, texture
// uploads and environment map generation. Measuring them would blame the device for a one-time cost.
const SLOW_WARMUP_MS = 4000;
// A frame this long is a stall (tab switch, debugger, the whole page frozen), not a rendering speed, so it is
// ignored instead of dragging the average down.
const SLOW_MAX_DT_MS = 250;

export const SLOW_FRAME_OPTIONS: FrameRateMonitorOptions = {
    thresholdFps: SLOW_THRESHOLD_FPS,
    windowMs: SLOW_WINDOW_MS,
    warmupMs: SLOW_WARMUP_MS,
    maxDtMs: SLOW_MAX_DT_MS,
};

// Room for the window at up to about 200 frames per second. A faster display never counts as slow, so a window the
// buffer cannot fill simply never reports.
const RING_CAPACITY = 1024;

// Watches frame times and says once, per warm-up cycle, when the recent average is below the threshold. It owns a
// fixed buffer, so sampling allocates nothing.
export class FrameRateMonitor {
    private readonly dts = new Float32Array(RING_CAPACITY);
    private head = 0;
    private count = 0;
    private sumMs = 0;
    private warmedMs = 0;
    private reported = false;

    constructor(private readonly options: FrameRateMonitorOptions) {}

    // Call once per frame. `hidden` is true while the page is not visible, when frame times mean nothing.
    // Returns true exactly once per warm-up cycle.
    sample(dtMs: number, hidden: boolean): boolean {
        // The first frame of a loop has no previous frame and reports 0.
        if (hidden || !(dtMs > 0) || dtMs > this.options.maxDtMs) return false;
        if (this.warmedMs < this.options.warmupMs) {
            this.warmedMs += dtMs;
            return false;
        }
        this.push(dtMs);
        if (this.reported || this.sumMs < this.options.windowMs) return false;
        // The window is full, so the average is frames over seconds.
        if ((this.count * 1000) / this.sumMs >= this.options.thresholdFps) return false;
        this.reported = true;
        return true;
    }

    // A rebuild or a status change starts the measurement over: what follows is a different look.
    restartWarmup(): void {
        this.head = 0;
        this.count = 0;
        this.sumMs = 0;
        this.warmedMs = 0;
        this.reported = false;
    }

    private push(dtMs: number): void {
        if (this.count === RING_CAPACITY) this.evictOldest();
        this.dts[(this.head + this.count) % RING_CAPACITY] = dtMs;
        this.count++;
        this.sumMs += dtMs;
        // Keep the window as short as it can be while still covering windowMs.
        while (this.count > 1 && this.sumMs - this.dts[this.head] >= this.options.windowMs) this.evictOldest();
    }

    private evictOldest(): void {
        this.sumMs -= this.dts[this.head];
        this.head = (this.head + 1) % RING_CAPACITY;
        this.count--;
    }
}

// One page visit: a plain module flag, so it resets on reload and survives scene rebuilds and route changes.
let slowNoticeDismissed = false;

export function isSlowNoticeDismissed(): boolean {
    return slowNoticeDismissed;
}

export function dismissSlowNotice(): void {
    slowNoticeDismissed = true;
}

// For specs only: puts the module back to a fresh page visit.
export function resetSlowNoticeDismissed(): void {
    slowNoticeDismissed = false;
}
