import { vi } from 'vitest';

// Stand-ins for the Web Audio and MediaStream APIs that AudioEngine and RhythmTracker use. jsdom and node have none
// of them. They are plain classes (no React, no three.js) that record what happened through `vi.fn()` spies and expose
// a few setters so a spec can play the browser's part (feed audio data, finish a worklet load, change the clock).
//
// Usage:
//   const web = installFakeWebAudio();          // stubs AudioContext, MediaStream, AudioWorkletNode
//   ... run code that does `new AudioContext()` ...
//   web.contexts[0].createdAnalysers[0]          // inspect what the code created
// Nodes can also be built directly (`new FakeAnalyserNode()`) and cast with `asWebAudio<AnalyserNode>(node)` when a
// function takes the real type. `vi.unstubAllGlobals()` (done in setup.ts after each test) undoes the install.

// The fakes only implement the members the app uses, so handing one to code typed for the real DOM class needs a
// cast. Doing it in one place keeps `as unknown as` out of every spec.
export function asWebAudio<T>(fake: unknown): T {
    return fake as T;
}

type Deferred = { resolve: () => void; reject: (error: unknown) => void };

export class FakeAudioParam {
    // Real params glide toward the target; the fake jumps straight to it so a spec can read the result at once.
    // The spy still records the requested time constant, which is what the AGC attack/release tests check.
    value: number;
    readonly setTargetAtTime = vi.fn((target: number, _startTime: number, _timeConstant: number) => {
        this.value = target;
    });

    constructor(value = 1) {
        this.value = value;
    }
}

// Base for every node: `connect`/`disconnect` are spies and the owning context is kept (RhythmTracker reads
// `analyser.context`).
export class FakeAudioNode {
    readonly connect = vi.fn((_destination?: unknown) => { });
    readonly disconnect = vi.fn((_destination?: unknown) => { });
    readonly context: FakeAudioContext;

    constructor(context?: FakeAudioContext) {
        this.context = context ?? new FakeAudioContext();
    }
}

export class FakeAnalyserNode extends FakeAudioNode {
    fftSize = 2048;
    smoothingTimeConstant = 0.8;
    minDecibels = -100;
    maxDecibels = -30;
    get frequencyBinCount(): number {
        return this.fftSize / 2;
    }

    // What the next read returns. Byte time-domain data is centred on 128 (silence); frequency data on 0.
    private frequencyData: ArrayLike<number> = [];
    private timeDomainData: ArrayLike<number> = [];
    private floatTimeDomainData: ArrayLike<number> = [];

    // Each setter takes either an array to copy from or a single number to fill the whole buffer with. The reads copy
    // `min(buffer length, data length)` values and fill the rest with silence, like a real analyser with a smaller window.
    setByteFrequencyData(data: ArrayLike<number> | number): void {
        this.frequencyData = typeof data === 'number' ? new Array(this.frequencyBinCount).fill(data) : data;
    }
    setByteTimeDomainData(data: ArrayLike<number> | number): void {
        this.timeDomainData = typeof data === 'number' ? new Array(this.fftSize).fill(data) : data;
    }
    setFloatTimeDomainData(data: ArrayLike<number> | number): void {
        this.floatTimeDomainData = typeof data === 'number' ? new Array(this.fftSize).fill(data) : data;
    }
    // Shortcut for level meters: a time-domain signal whose peak is `peak` (0..1), as AudioEngine.readPeak measures it.
    setPeak(peak: number): void {
        const data = new Array(this.fftSize).fill(128);
        data[0] = Math.round(128 + peak * 128);
        this.setByteTimeDomainData(data);
    }

    readonly getByteFrequencyData = vi.fn((target: Uint8Array) => {
        copyInto(target, this.frequencyData, 0);
    });
    readonly getByteTimeDomainData = vi.fn((target: Uint8Array) => {
        // Before a spec sets data, report silence rather than zeros (0 would read as a full-scale negative peak).
        copyInto(target, this.timeDomainData, 128);
    });
    readonly getFloatTimeDomainData = vi.fn((target: Float32Array) => {
        copyInto(target, this.floatTimeDomainData, 0);
    });
}

function copyInto(target: { length: number;[index: number]: number }, source: ArrayLike<number>, fallback: number): void {
    for (let i = 0; i < target.length; i++) {
        target[i] = i < source.length ? source[i] : fallback;
    }
}

export class FakeGainNode extends FakeAudioNode {
    readonly gain = new FakeAudioParam(1);
}

export class FakeBiquadFilterNode extends FakeAudioNode {
    type = 'lowpass';
    readonly frequency = new FakeAudioParam(350);
    readonly Q = new FakeAudioParam(1);
}

export class FakeMediaStreamTrack {
    readyState: 'live' | 'ended' = 'live';
    muted = false;
    enabled = true;
    // What `getSettings()` returns. AudioEngine reads `latency` from it, so a spec can set or omit it.
    settings: Record<string, unknown> = {};
    readonly stop = vi.fn(() => {
        this.readyState = 'ended';
    });
    readonly getSettings = vi.fn(() => this.settings);

    constructor(readonly kind: 'audio' | 'video' = 'audio', public label = `fake ${kind} track`) { }
}

export class FakeMediaStream {
    private readonly tracks: FakeMediaStreamTrack[];

    // Like the real constructor, accepts the tracks to wrap (AudioEngine does `new MediaStream(stream.getAudioTracks())`).
    constructor(tracks: FakeMediaStreamTrack[] = []) {
        this.tracks = [...tracks];
    }
    readonly getTracks = () => [...this.tracks];
    readonly getAudioTracks = () => this.tracks.filter(track => track.kind === 'audio');
    readonly getVideoTracks = () => this.tracks.filter(track => track.kind === 'video');
}

export class FakeMediaStreamAudioSourceNode extends FakeAudioNode {
    constructor(context: FakeAudioContext, readonly mediaStream: FakeMediaStream) {
        super(context);
    }
}

// A stream as the browser's capture dialogs return it. Screen capture with "share audio" off is `{ audio: false }`.
export function createFakeStream({ audio = true, video = false, label = 'fake audio track', latency }:
    { audio?: boolean; video?: boolean; label?: string; latency?: number } = {}): FakeMediaStream {
    const tracks: FakeMediaStreamTrack[] = [];
    if (audio) {
        const track = new FakeMediaStreamTrack('audio', label);
        if (latency !== undefined) track.settings = { latency };
        tracks.push(track);
    }
    if (video) tracks.push(new FakeMediaStreamTrack('video', 'fake video track'));
    return new FakeMediaStream(tracks);
}

// `audioContext.audioWorklet`. By default `addModule` resolves immediately. A spec that needs to control the timing
// (a source switch while the module is still loading, a failed load) sets `manual = true` and then calls
// `resolveAll()` / `rejectAll(error)`; or sets `failWith` to make every call reject.
export class FakeAudioWorklet {
    manual = false;
    failWith: unknown = undefined;
    private pending: Deferred[] = [];

    readonly addModule = vi.fn((_url: string | URL): Promise<void> => {
        if (this.failWith !== undefined) {
            return Promise.reject(this.failWith);
        }
        if (!this.manual) {
            return Promise.resolve();
        }
        return new Promise<void>((resolve, reject) => this.pending.push({ resolve, reject }));
    });

    resolveAll(): void {
        this.pending.splice(0).forEach(deferred => deferred.resolve());
    }
    rejectAll(error: unknown = new Error('addModule failed')): void {
        this.pending.splice(0).forEach(deferred => deferred.reject(error));
    }
}

export class FakeAudioContext {
    sampleRate: number;
    currentTime = 0;
    baseLatency = 0.01;
    // Undefined by default because Firefox and Safari lack it; AudioEngine.latencyInfo handles that case.
    outputLatency: number | undefined = undefined;
    state: 'suspended' | 'running' | 'closed' = 'suspended';
    readonly audioWorklet = new FakeAudioWorklet();

    // Everything the code under test created, in creation order, so a spec can reach the nodes AudioEngine keeps private.
    readonly createdSources: FakeMediaStreamAudioSourceNode[] = [];
    readonly createdGains: FakeGainNode[] = [];
    readonly createdAnalysers: FakeAnalyserNode[] = [];
    readonly createdFilters: FakeBiquadFilterNode[] = [];

    // Contexts created outside a user gesture start suspended, and `resume()` is what makes them run.
    readonly resume = vi.fn(async () => {
        this.state = 'running';
    });
    readonly close = vi.fn(async () => {
        this.state = 'closed';
    });

    constructor(options: { sampleRate?: number } = {}) {
        this.sampleRate = options.sampleRate ?? 48000;
    }

    readonly createMediaStreamSource = vi.fn((stream: FakeMediaStream) => {
        const node = new FakeMediaStreamAudioSourceNode(this, stream);
        this.createdSources.push(node);
        return node;
    });
    readonly createGain = vi.fn(() => {
        const node = new FakeGainNode(this);
        this.createdGains.push(node);
        return node;
    });
    readonly createAnalyser = vi.fn(() => {
        const node = new FakeAnalyserNode(this);
        this.createdAnalysers.push(node);
        return node;
    });
    readonly createBiquadFilter = vi.fn(() => {
        const node = new FakeBiquadFilterNode(this);
        this.createdFilters.push(node);
        return node;
    });
}

// A worklet node whose `port` is one end of a real MessageChannel, because RhythmTracker uses the port's
// `addEventListener('message')`, `start()` and `close()`. `processorPort` is the other end: a spec calls
// `node.processorPort.postMessage(batch)` to play the processor, and the message arrives asynchronously, as in a
// browser (await it, e.g. with `vi.waitFor`).
export class FakeAudioWorkletNode extends FakeAudioNode {
    readonly port: MessagePort;
    readonly processorPort: MessagePort;
    onprocessorerror: ((event: Event) => void) | null = null;

    constructor(context: FakeAudioContext, readonly name: string, readonly options?: unknown) {
        super(context);
        const channel = new MessageChannel();
        this.port = channel.port1;
        this.processorPort = channel.port2;
    }
}

export interface FakeWebAudio {
    // Every instance the code under test constructed, in order.
    contexts: FakeAudioContext[];
    workletNodes: FakeAudioWorkletNode[];
    streams: FakeMediaStream[];
}

// Stubs the three globals. Each constructor is a subclass that records its instances in the returned object.
export function installFakeWebAudio(): FakeWebAudio {
    const installed: FakeWebAudio = { contexts: [], workletNodes: [], streams: [] };

    class RecordingAudioContext extends FakeAudioContext {
        constructor(options?: { sampleRate?: number }) {
            super(options);
            installed.contexts.push(this);
        }
    }
    class RecordingMediaStream extends FakeMediaStream {
        constructor(tracks?: FakeMediaStreamTrack[]) {
            super(tracks);
            installed.streams.push(this);
        }
    }
    class RecordingAudioWorkletNode extends FakeAudioWorkletNode {
        constructor(context: FakeAudioContext, name: string, options?: unknown) {
            super(context, name, options);
            installed.workletNodes.push(this);
        }
    }

    vi.stubGlobal('AudioContext', RecordingAudioContext);
    vi.stubGlobal('MediaStream', RecordingMediaStream);
    vi.stubGlobal('AudioWorkletNode', RecordingAudioWorkletNode);
    return installed;
}
