import { BASS_INK_ANALYSER } from '../../../app/features/visualizers/bass-ink/bassInkAnalyser';
import { bassInkConfig } from '../../../app/features/visualizers/bass-ink/bassInkConfig';
import { bassBinCount, bassLevel, EnergyTracker } from '../../../app/features/visualizers/bass-ink/energyEnvelope';
import { SetDirector } from '../../../app/features/visualizers/bass-ink/setDirector';
import { OnsetExtractor, packFrame } from '../../../app/features/rhythm/onsetExtractor';
import { RhythmAnalyzer } from '../../../app/features/rhythm/rhythmAnalyzer';
import { BATCH_FRAMES, FFT_SIZE, FRAME_STRIDE } from '../../../app/features/rhythm/rhythmConfig';
import { applyAgc } from './agc';
import { RENDER_HZ } from './replay';

// The advisory set-director measurement (hub follow-ups S4, AC6): how often and when `bass-ink`'s set director starts a
// transition to a new formation on a real track. The director reads two things: the rhythm state (kick onsets, novelty,
// chroma, song changes) and the bass energy envelope. The state comes from the same tracker pipeline the replay runs;
// the energy comes from the analyser byte spectrum the scene reads today, which `AnalyserNode` is emulated for below.
// Only the director's own code is the app's: the offline cell exists so that a change to where the energy comes from
// (the hub, FU-S9-bass-ink-energy) can be compared with this one before it is kept.
//
// Fidelity notes. The analyser is emulated from the post-gain audio with the Web Audio spec's own steps (a Blackman window
// over the last fftSize samples, magnitudes over fftSize, smoothing per call, then the dB-to-byte mapping), read once per
// 60 Hz render tick, only for the bins the scene sums (bins 1 to the bass cutoff). A browser reads it at the animation
// frame's real time and its smoothing steps per rendered block, so the levels differ slightly from a live run. The
// tracker's state reaches the director at batch arrival times exactly as in replay.ts. The scene clock here is the audio
// clock with no frame-time clamp.

// What one track measured: the scene times, in seconds, at which the director started a transition.
export interface SetDirectorMeasure {
    track: string;
    transitionTimes: number[];
}

// The Blackman window of the Web Audio spec (alpha 0.16), applied to the last fftSize samples before every read.
const BLACKMAN_ALPHA = 0.16;

// The analyser's smoothed byte spectrum over the bins the scene sums into its bass level, from audio samples. Allocates
// once, at construction; `level` allocates nothing.
export class BassByteLevel {
    private readonly fftSize = BASS_INK_ANALYSER.fftSize;
    private readonly count: number;
    // The window times cosine and sine of each bin, bins 1 to `count`, so one read is a few thousand multiplies.
    private readonly cosines: Float64Array[] = [];
    private readonly sines: Float64Array[] = [];
    private readonly smoothed: Float64Array;
    private readonly bytes: Uint8Array;

    constructor(sampleRate: number) {
        const size = this.fftSize;
        this.count = bassBinCount(sampleRate, size, bassInkConfig.energy.bassCutoffHz);
        this.smoothed = new Float64Array(this.count + 1);
        this.bytes = new Uint8Array(this.count + 1);
        const a0 = (1 - BLACKMAN_ALPHA) / 2;
        const a2 = BLACKMAN_ALPHA / 2;
        for (let bin = 1; bin <= this.count; bin++) {
            const cosine = new Float64Array(size);
            const sine = new Float64Array(size);
            for (let n = 0; n < size; n++) {
                const window = a0 - 0.5 * Math.cos((2 * Math.PI * n) / size) + a2 * Math.cos((4 * Math.PI * n) / size);
                cosine[n] = window * Math.cos((2 * Math.PI * bin * n) / size);
                sine[n] = window * Math.sin((2 * Math.PI * bin * n) / size);
            }
            this.cosines.push(cosine);
            this.sines.push(sine);
        }
    }

    // One getByteFrequencyData call at the moment the audio has reached sample `end` (exclusive), as the scene's 0..1 bass
    // level. Samples before the start of the audio read as silence.
    level(pcm: Float32Array, end: number): number {
        const { fftSize, count, smoothed, bytes } = this;
        const tau = BASS_INK_ANALYSER.smoothingTimeConstant;
        const range = BASS_INK_ANALYSER.maxDecibels - BASS_INK_ANALYSER.minDecibels;
        const start = end - fftSize;
        for (let bin = 1; bin <= count; bin++) {
            const cosine = this.cosines[bin - 1];
            const sine = this.sines[bin - 1];
            let re = 0;
            let im = 0;
            for (let n = Math.max(0, -start); n < fftSize; n++) {
                const index = start + n;
                if (index >= pcm.length) break;
                re += pcm[index] * cosine[n];
                im -= pcm[index] * sine[n];
            }
            const magnitude = Math.hypot(re, im) / fftSize;
            smoothed[bin] = tau * smoothed[bin] + (1 - tau) * magnitude;
            const decibels = 20 * Math.log10(smoothed[bin]);
            bytes[bin] = Math.min(
                255,
                Math.max(0, Math.floor((255 * (decibels - BASS_INK_ANALYSER.minDecibels)) / range)),
            );
        }
        return bassLevel(bytes, count);
    }
}

// Replays one track through the tracker and `bass-ink`'s energy envelope and set director on the 60 Hz render clock, and
// returns when the director started each transition. Deterministic.
export function measureSetDirector(track: string, pcm: Float32Array, sampleRate: number): SetDirectorMeasure {
    const audio = applyAgc(pcm, sampleRate);
    const extractor = new OnsetExtractor(sampleRate);
    const analyzer = new RhythmAnalyzer(extractor.frameRate);
    const state = analyzer.state;
    const bass = new BassByteLevel(sampleRate);
    const energy = new EnergyTracker();
    const director = new SetDirector();
    const dt = 1 / RENDER_HZ;
    const transitionTimes: number[] = [];

    let tick = 0;
    // One animation frame: the tracker's phase to the render time, the energy follows the analyser's bass, the director
    // reads both.
    const renderTick = (): void => {
        const time = tick * dt;
        tick++;
        analyzer.updatePhase(time);
        energy.update(bass.level(audio, Math.floor(time * sampleRate)), dt);
        const before = director.cue.transitionCount;
        director.update(state, energy, time);
        if (director.cue.transitionCount !== before) transitionTimes.push(director.cue.transitionStart);
    };

    // The tracker analyzes whole batches of frames when the last of them arrives (see replay.ts); the render ticks before
    // that moment have not seen them.
    const frames = new Float32Array(BATCH_FRAMES * FRAME_STRIDE);
    const times = new Float64Array(BATCH_FRAMES);
    let queued = 0;
    const deliver = (arrival: number): void => {
        while (tick * dt < arrival) renderTick();
        for (let i = 0; i < queued; i++) {
            analyzer.pushFrame(times[i], frames, i * FRAME_STRIDE);
            analyzer.updatePhase(times[i]);
        }
        queued = 0;
    };
    const blockSize = 128;
    for (let offset = 0; offset < audio.length; offset += blockSize) {
        extractor.push(audio.subarray(offset, Math.min(audio.length, offset + blockSize)), (frame) => {
            const time = (frame.endSample - FFT_SIZE / 2) / sampleRate;
            packFrame(frame, frames, queued * FRAME_STRIDE);
            times[queued] = time;
            if (++queued === BATCH_FRAMES) deliver(time);
        });
    }
    const seconds = audio.length / sampleRate;
    while (tick * dt <= seconds) renderTick();
    return { track, transitionTimes };
}
