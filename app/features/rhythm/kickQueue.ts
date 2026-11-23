// What can receive a kick event; BeatTracker does.
export interface KickSink {
    pushKick(time: number, strength: number): void;
}

// The kick events of the worklet, from the moment their batch arrives until the analyzer reaches the batch's first
// frame. Events keep their arrival order and their own timestamp: the worklet decides an onset a couple of frames late,
// so an event is often older than the frames of the batch that carries it, and holding or sorting them by time against
// the frames would reorder what the worklet sent.
//
// A ring with fixed storage: allocation-free after the constructor. When it is full the oldest event is dropped and
// counted, so a stalled consumer loses old events rather than growing.
export class KickQueue {
    private readonly times: Float64Array;
    private readonly strengths: Float32Array;
    private readonly capacity: number;
    private head = 0;
    private count = 0;
    private overflows = 0;

    constructor(capacity: number) {
        this.capacity = capacity;
        this.times = new Float64Array(capacity);
        this.strengths = new Float32Array(capacity);
    }

    // Events waiting for delivery.
    get size(): number {
        return this.count;
    }

    // Events dropped because the queue was full, over the queue's whole life (clear() does not reset it).
    get overflowCount(): number {
        return this.overflows;
    }

    push(time: number, strength: number): void {
        if (this.count === this.capacity) {
            this.head = (this.head + 1) % this.capacity;
            this.count--;
            this.overflows++;
        }
        const slot = (this.head + this.count) % this.capacity;
        this.times[slot] = time;
        this.strengths[slot] = strength;
        this.count++;
    }

    // Hands every waiting event to `sink`, oldest first, and empties the queue, so each event is delivered once.
    drainTo(sink: KickSink): void {
        const count = this.count;
        const head = this.head;
        this.head = 0;
        this.count = 0;
        for (let i = 0; i < count; i++) {
            const slot = (head + i) % this.capacity;
            sink.pushKick(this.times[slot], this.strengths[slot]);
        }
    }

    // Forgets the waiting events without delivering them.
    clear(): void {
        this.head = 0;
        this.count = 0;
    }
}
