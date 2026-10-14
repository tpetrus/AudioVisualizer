export type AudioSourceMode = 'screen' | 'device';

export interface AudioGraph {
    audioStream: MediaStream | undefined;
    audioContext: AudioContext | undefined;
    source: MediaStreamAudioSourceNode | undefined;
    analyser: AnalyserNode | undefined;
    meter: AnalyserNode | undefined;
    outputMeter: AnalyserNode | undefined;
    gainNode: GainNode | undefined;
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

export const DEFAULT_AUDIO_GRAPH: AudioGraph = {
    audioStream: undefined,
    audioContext: undefined,
    source: undefined,
    analyser: undefined,
    meter: undefined,
    outputMeter: undefined,
    gainNode: undefined
}