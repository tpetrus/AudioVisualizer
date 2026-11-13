// The one rule that keeps the visualizer photosensitivity-safe (plan C2): no more than `maxPerSecond` global flashes
// in any one-second window, however busy the music is. Every brightness increase asks here first.
export class BrightnessGovernor {
    private readonly grants: Float64Array;
    private readonly maxPerSecond: number;
    private head = 0;
    private size = 0;

    constructor(maxPerSecond = 3) {
        this.maxPerSecond = maxPerSecond;
        this.grants = new Float64Array(Math.max(1, maxPerSecond));
    }

    // Returns the granted amount (strength x intensity, both clamped to 0..1), or 0 when nothing is granted. A zero
    // request does not use a slot, so silence or intensity 0 never blocks a later real flash.
    request(strength: number, nowSeconds: number, intensity: number): number {
        const amount = Math.min(1, Math.max(0, strength)) * Math.min(1, Math.max(0, intensity));
        if (amount <= 0) {
            return 0;
        }
        // Drop grants that left the sliding window; the ring is ordered oldest first.
        while (this.size > 0 && nowSeconds - this.grants[this.oldestIndex()] >= 1) {
            this.size--;
        }
        if (this.size >= this.maxPerSecond) {
            return 0;
        }
        this.grants[this.head] = nowSeconds;
        this.head = (this.head + 1) % this.grants.length;
        this.size++;
        return amount;
    }

    private oldestIndex(): number {
        return (this.head - this.size + this.grants.length) % this.grants.length;
    }
}
