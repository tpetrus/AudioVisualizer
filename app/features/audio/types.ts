export type AudioSourceMode = 'screen' | 'device';

// The Web Audio nodes for one capture. They exist together or not at all: the engine holds a complete graph while
// capturing and `undefined` otherwise.
export interface AudioGraph {
    audioStream: MediaStream;
    audioContext: AudioContext;
    source: MediaStreamAudioSourceNode;
    gainNode: GainNode;
    // What the visualizations read: the input after normalization.
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
    targetPeak: number;      // desired peak level, 0..1 of full scale
    maxGain: number;         // never amplify more than this
    peakHold: number;        // seconds for the measured peak to halve once the audio gets quieter
    releaseTime: number;     // seconds the gain takes to rise when the audio gets quieter
    noiseFloor: number;      // inputs quieter than this (0..1) are treated as silence and not amplified
}

export const DEFAULT_NORMALIZE_SETTINGS: NormalizeSettings = {
    targetPeak: 0.7,
    maxGain: 16,
    peakHold: 3,
    releaseTime: 0.4,
    noiseFloor: 0.004
};