export type AudioSourceMode = 'screen' | 'device';

// What a source opener hands the engine: the node that feeds the gain stage and raw meter, plus how to free it.
export interface SourceInput {
    node: AudioNode;
    stop: () => void; // frees the source (stops stream tracks, or stops/disconnects buffer nodes)
    stream?: MediaStream; // present for capture sources; used by trackInfo and latencyInfo
    label?: string; // trackInfo text for non-stream sources
}
export type SourceOpener = (context: AudioContext) => SourceInput | Promise<SourceInput>;

// The Web Audio nodes for one capture. They exist together or not at all: the engine holds a complete graph while
// capturing and `undefined` otherwise.
export interface AudioGraph {
    input: SourceInput;
    audioContext: AudioContext;
    source: AudioNode;
    gainNode: GainNode;
    // The engine-owned tap: the input after normalization, with fixed settings (see ENGINE_TAP_SETTINGS).
    analyser: AnalyserNode;
    // Peak meters for the raw input (before the gain) and the normalized output.
    meter: AnalyserNode;
    outputMeter: AnalyserNode;
}

export interface SavedSource {
    mode: AudioSourceMode;
    deviceId?: string;
}

// Automatic gain control tuning.
export interface NormalizeSettings {
    targetPeak: number; // desired peak level, 0..1 of full scale
    maxGain: number; // never amplify more than this
    peakHold: number; // seconds for the measured peak to halve once the audio gets quieter
    releaseTime: number; // seconds the gain takes to rise when the audio gets quieter
    noiseFloor: number; // inputs quieter than this (0..1) are treated as silence and not amplified
}

export const DEFAULT_NORMALIZE_SETTINGS: NormalizeSettings = {
    targetPeak: 0.7,
    maxGain: 16,
    peakHold: 3,
    releaseTime: 0.4,
    noiseFloor: 0.004,
};

// The settings of one AnalyserNode. Every consumer that reads frequency or time-domain data declares its own.
export interface AnalyserSettings {
    fftSize: number;
    smoothingTimeConstant: number;
    minDecibels: number;
    maxDecibels: number;
}

// The engine tap's fixed settings. Nothing outside the engine may change them, so what the tracker and the other
// readers of the tap see never depends on which visualizer was opened before.
export const ENGINE_TAP_SETTINGS: Readonly<AnalyserSettings> = Object.freeze({
    fftSize: 2048,
    smoothingTimeConstant: 0,
    minDecibels: -100,
    maxDecibels: -30,
});

// Assigns every setting on a node. A real AnalyserNode throws when the minimum is set at or above the current maximum
// (or the maximum at or below the current minimum), so the end of the range that cannot collide with the old one goes
// first: a new minimum at or above the old maximum means the maximum must move up before the minimum can follow.
export function assignAnalyserSettings(node: AnalyserNode, settings: AnalyserSettings): void {
    if (settings.minDecibels >= node.maxDecibels) {
        node.maxDecibels = settings.maxDecibels;
        node.minDecibels = settings.minDecibels;
    } else {
        node.minDecibels = settings.minDecibels;
        node.maxDecibels = settings.maxDecibels;
    }
    node.fftSize = settings.fftSize;
    node.smoothingTimeConstant = settings.smoothingTimeConstant;
}

export interface OwnedAnalyser {
    // The consumer's node for the current source, or undefined while nothing is captured. A new source gives a new
    // node (new AudioContext); the engine notifies `subscribe` listeners when that happens.
    getNode: () => AnalyserNode | undefined;
    // Disconnects the node and stops the engine recreating it. Safe to call twice.
    release: () => void;
}
