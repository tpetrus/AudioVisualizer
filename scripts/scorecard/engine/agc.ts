import { AGC_INTERVAL_MS, METER_FFT_SIZE, agcStep } from '../../../app/features/audio/agc';
import { DEFAULT_NORMALIZE_SETTINGS, type NormalizeSettings } from '../../../app/features/audio/types';

// The peak, 0..1, that the engine's meter analyser reports: getByteTimeDomainData stores the unsigned byte of
// 128 * (1 + x), clamped to 0..255, and the engine reads |v - 128| / 128. The quantization matters for a quiet input,
// where one byte step is a visible share of the level.
export function bytePeak(pcm: Float32Array, end: number, length: number = METER_FFT_SIZE): number {
    let peak = 0;
    for (let i = Math.max(0, end - length); i < end; i++) {
        const byte = Math.floor(Math.min(255, Math.max(0, 128 * (1 + pcm[i]))));
        peak = Math.max(peak, Math.abs(byte - 128));
    }
    return peak / 128;
}

// Applies the engine's automatic gain control to mono PCM, as the live graph does before anything reads the audio. The
// decision is the engine's own (`agcStep`); this only replays its schedule. The engine starts with a gain of 1 and an
// empty envelope, and ticks every AGC_INTERVAL_MS from the capture's start. A tick measures the peak of the last
// METER_FFT_SIZE raw samples and may set a gain target. Between ticks the gain follows setTargetAtTime, an exponential
// approach to the target with the step's time constant, evaluated per sample. The output is not clipped: the Web Audio
// graph is float.
export function applyAgc(
    pcm: Float32Array,
    sampleRate: number,
    settings: NormalizeSettings = DEFAULT_NORMALIZE_SETTINGS,
): Float32Array {
    const out = new Float32Array(pcm.length);
    const tickSeconds = AGC_INTERVAL_MS / 1000;
    let gain = 1;
    let envelope = 0;
    let target = 1;
    // Per-sample share of the distance to the target that is kept; until a first target is set the gain is already on it.
    let retain = 1;
    let position = 0;
    for (let tick = 0; position < pcm.length; tick++) {
        const tickSample = Math.min(pcm.length, Math.floor(tick * tickSeconds * sampleRate));
        // A tick at the very start measures an empty meter: silence, so it changes nothing.
        const level = bytePeak(pcm, tickSample);
        const decision = agcStep(envelope, level, gain, settings);
        envelope = decision.envelope;
        if (decision.wantedGain !== undefined && decision.timeConstant !== undefined) {
            target = decision.wantedGain;
            retain = Math.exp(-1 / (sampleRate * decision.timeConstant));
        }
        const end = Math.min(pcm.length, Math.floor((tick + 1) * tickSeconds * sampleRate));
        for (; position < end; position++) {
            out[position] = pcm[position] * gain;
            gain = target + (gain - target) * retain;
        }
    }
    return out;
}
