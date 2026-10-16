import { vi } from 'vitest';
import type { AudioEngine } from '~/features/audio/audioEngine';
import { DEFAULT_NORMALIZE_SETTINGS, type NormalizeSettings, type SavedSource } from '~/features/audio/types';
import type { RhythmTracker } from '~/features/rhythm/rhythmTracker';
import { createRhythmState, type BeatsPerBar } from '~/features/rhythm/types';

// Lightweight stand-ins for the two app-wide singletons, for specs of components and hooks that read them through
// `useAudio()` / `useRhythm()` (see renderWithProviders.tsx). They do no audio work: the spec sets the values the UI
// should see and the fakes notify subscribers, the way the real ones do. To test the real AudioEngine or RhythmTracker
// use the Web Audio fakes instead.
//
// Both are cast with `asEngine(...)` / `asTracker(...)` where the real class is required: the real classes have private
// members, so a structural fake can never be assignable to them.

export class FakeAudioEngine {
    private readonly listeners = new Set<() => void>();
    readonly subscribe = (listener: () => void): (() => void) => {
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
    };

    // Values the UI reads. Change them with the setters below so subscribers are notified.
    private analyser: AnalyserNode | undefined;
    private normalizeSettings: NormalizeSettings = { ...DEFAULT_NORMALIZE_SETTINGS };
    private normalize = true;
    saved: SavedSource | undefined = undefined;
    level = 0;
    outputLevel = 0;
    trackInfo = '';
    latencyInfo: AudioEngine['latencyInfo'] = {};

    readonly getAnalyser = () => this.analyser;
    readonly getIsCapturing = () => this.analyser !== undefined;
    readonly getNormalizeOptions = () => this.normalizeSettings;
    readonly getNormalize = () => this.normalize;
    get savedSource(): SavedSource | undefined {
        return this.saved;
    }
    readonly getLevel = vi.fn(() => this.level);
    readonly getOutputLevel = vi.fn(() => this.outputLevel);

    // Actions are spies so a spec can assert on them; each resolves immediately unless the spec overrides it.
    readonly startScreenCapture = vi.fn(async () => { });
    readonly startDeviceCapture = vi.fn(async (_deviceId: string) => { });
    readonly getInputDevices = vi.fn(async (): Promise<MediaDeviceInfo[]> => []);
    readonly resumeSavedSource = vi.fn(async () => this.analyser !== undefined);
    readonly forgetSavedSource = vi.fn(() => { this.saved = undefined; });
    readonly stopCapture = vi.fn(() => this.setAnalyser(undefined));
    readonly setNormalize = vi.fn((enabled: boolean) => {
        this.normalize = enabled;
        this.notify();
    });
    readonly updateNormalizeOptions = vi.fn((changes: Partial<NormalizeSettings>) => {
        this.normalizeSettings = { ...this.normalizeSettings, ...changes };
        this.notify();
    });
    readonly resetNormalizeOptions = vi.fn(() => {
        this.normalizeSettings = { ...DEFAULT_NORMALIZE_SETTINGS };
        this.notify();
    });

    // `undefined` means "not capturing". Pass a `FakeAnalyserNode` cast with `asWebAudio<AnalyserNode>(...)`.
    setAnalyser(analyser: AnalyserNode | undefined): void {
        this.analyser = analyser;
        this.notify();
    }

    notify(): void {
        [...this.listeners].forEach(listener => listener());
    }
}

export class FakeRhythmTracker {
    // The same preallocated state object as the real tracker; a spec mutates it directly (`tracker.state.bpm = 120`).
    readonly state = createRhythmState();

    private beatsPerBar: BeatsPerBar | undefined;
    private songChangeCount = 0;
    private readonly listeners = new Set<() => void>();
    readonly subscribe = (listener: () => void): (() => void) => {
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
    };
    readonly getBeatsPerBar = () => this.beatsPerBar;
    readonly getSongChangeCount = () => this.songChangeCount;

    readonly start = vi.fn((_engine: unknown) => { });
    readonly dispose = vi.fn(() => { });
    readonly updatePhase = vi.fn((_now?: number) => { });

    // The store values change rarely and notify; set them here to re-render subscribed components.
    setBeatsPerBar(value: BeatsPerBar | undefined): void {
        this.beatsPerBar = value;
        this.state.beatsPerBar = value;
        this.notify();
    }
    setSongChangeCount(value: number): void {
        this.songChangeCount = value;
        this.state.songChangeCount = value;
        this.notify();
    }

    private notify(): void {
        [...this.listeners].forEach(listener => listener());
    }
}

export function asEngine(fake: FakeAudioEngine): AudioEngine {
    return fake as unknown as AudioEngine;
}

export function asTracker(fake: FakeRhythmTracker): RhythmTracker {
    return fake as unknown as RhythmTracker;
}
