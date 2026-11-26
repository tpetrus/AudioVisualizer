import { beforeEach, describe, expect, it } from 'vitest';
import {
    dismissSlowNotice,
    FrameRateMonitor,
    isSlowNoticeDismissed,
    resetSlowNoticeDismissed,
    SLOW_FRAME_OPTIONS,
} from './frameRateMonitor';

const options = { thresholdFps: 40, windowMs: 1000, warmupMs: 500, maxDtMs: 250 };

// Feeds `count` visible frames of `dtMs` each; returns how many times sample reported.
function feed(monitor: FrameRateMonitor, count: number, dtMs: number, hidden = false): number {
    let reports = 0;
    for (let i = 0; i < count; i++) if (monitor.sample(dtMs, hidden)) reports++;
    return reports;
}

describe('FrameRateMonitor', () => {
    it('uses the decided thresholds', () => {
        expect(SLOW_FRAME_OPTIONS).toEqual({ thresholdFps: 40, windowMs: 5000, warmupMs: 4000, maxDtMs: 250 });
    });

    it('stays silent through the warm-up even when frames are slow', () => {
        const monitor = new FrameRateMonitor(options);
        expect(feed(monitor, 20, 25)).toBe(0); // 500 ms of 25 ms frames: exactly the warm-up
    });

    it('reports once when the window after the warm-up averages below the threshold', () => {
        const monitor = new FrameRateMonitor(options);
        feed(monitor, 20, 25);
        // 1000 ms of 50 ms frames is 20 fps.
        expect(feed(monitor, 40, 50)).toBe(1);
    });

    it('does not report a fast window', () => {
        const monitor = new FrameRateMonitor(options);
        feed(monitor, 20, 16);
        expect(feed(monitor, 400, 16)).toBe(0);
    });

    it('waits for a full window before reporting', () => {
        const monitor = new FrameRateMonitor(options);
        feed(monitor, 20, 25);
        expect(feed(monitor, 10, 50)).toBe(0); // only 500 ms of the 1000 ms window
    });

    it('reports again only after restartWarmup', () => {
        const monitor = new FrameRateMonitor(options);
        feed(monitor, 20, 25);
        expect(feed(monitor, 60, 50)).toBe(1);

        monitor.restartWarmup();
        // Back in the warm-up: slow frames are not measured.
        expect(feed(monitor, 10, 50)).toBe(0);
        feed(monitor, 10, 50);
        expect(feed(monitor, 40, 50)).toBe(1);
    });

    it('ignores hidden frames and non-positive gaps; none of them count toward the warm-up', () => {
        const monitor = new FrameRateMonitor(options);
        feed(monitor, 100, 50, true);
        feed(monitor, 1, 50); // the first visible frame after hidden ones carries the hidden gap
        feed(monitor, 5, 0);
        feed(monitor, 5, -3);
        feed(monitor, 5, NaN);
        // The warm-up has not advanced, so 500 ms of slow frames is still warm-up and silent.
        expect(feed(monitor, 10, 50)).toBe(0);
        expect(feed(monitor, 20, 50)).toBe(1);
    });

    it('ignores one long frame right after hidden frames', () => {
        const monitor = new FrameRateMonitor(options);
        feed(monitor, 3, 16, true);
        expect(feed(monitor, 1, 5000)).toBe(0);
        // It did not count toward the warm-up: 500 ms of fast frames still leaves the warm-up unfinished.
        feed(monitor, 20, 25);
        expect(feed(monitor, 40, 50)).toBe(1);
    });

    it('counts a long visible frame as maxDtMs, so a steady 3 fps device reports once after the warm-up', () => {
        const monitor = new FrameRateMonitor(options);
        // 333 ms frames clamp to 250: two fill the warm-up, then four fill the 1000 ms window.
        expect(feed(monitor, 2, 333)).toBe(0);
        expect(feed(monitor, 3, 333)).toBe(0);
        expect(feed(monitor, 1, 333)).toBe(1);
        expect(feed(monitor, 20, 333)).toBe(0);
    });

    it('slides the window so an old slow stretch does not outlive a recovery', () => {
        const monitor = new FrameRateMonitor({ ...options, thresholdFps: 30 });
        feed(monitor, 20, 25);
        // 1 s at 35 fps (about 28.6 ms) is above 30 and is not reported.
        expect(feed(monitor, 35, 1000 / 35)).toBe(0);
        // Fast frames keep it quiet.
        expect(feed(monitor, 200, 10)).toBe(0);
    });

    it('keeps working when more frames arrive than the buffer holds', () => {
        const monitor = new FrameRateMonitor({ ...options, windowMs: 5000 });
        feed(monitor, 200, 3);
        // 3 ms frames never fill 5 s in 1024 slots; the buffer wraps without reporting or throwing.
        expect(feed(monitor, 5000, 3)).toBe(0);
    });

    it('wraps its ring correctly over many frames before a slow stretch', () => {
        const monitor = new FrameRateMonitor(options);
        feed(monitor, 20, 25);
        expect(feed(monitor, 3000, 16)).toBe(0);
        expect(feed(monitor, 80, 50)).toBe(1);
    });
});

describe('slow notice dismissal', () => {
    beforeEach(() => resetSlowNoticeDismissed());

    it('is a page-visit flag that starts false and stays dismissed', () => {
        expect(isSlowNoticeDismissed()).toBe(false);
        dismissSlowNotice();
        expect(isSlowNoticeDismissed()).toBe(true);
        dismissSlowNotice();
        expect(isSlowNoticeDismissed()).toBe(true);
    });
});
