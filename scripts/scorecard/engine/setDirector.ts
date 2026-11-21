import { AudioHub } from '../../../app/features/audio/hub/audioHub';
import { BASS_INK_ANALYSER } from '../../../app/features/visualizers/bass-ink/bassInkAnalyser';
import { bassInkConfig } from '../../../app/features/visualizers/bass-ink/bassInkConfig';
import { bassBinCount, bassLevel, EnergyTracker } from '../../../app/features/visualizers/bass-ink/energyEnvelope';
import { SetDirector } from '../../../app/features/visualizers/bass-ink/setDirector';
import { BandOnsets } from '../../../app/features/rhythm/bandOnsets';
import { OnsetExtractor, packFrame } from '../../../app/features/rhythm/onsetExtractor';
import { RhythmAnalyzer } from '../../../app/features/rhythm/rhythmAnalyzer';
import {
    BATCH_FRAMES,
    FEATURE_ONSET_BAND_COUNT,
    FFT_SIZE,
    FRAME_STRIDE,
    HUB_BAND_COUNT,
} from '../../../app/features/rhythm/rhythmConfig';
import { FEATURE_MESSAGE_VERSION, type FeatureBatch } from '../../../app/features/rhythm/types';
import { applyAgc } from './agc';
import { RENDER_HZ } from './replay';

// The advisory set-director measurement (hub follow-ups S4, AC6): how often and when `bass-ink`'s set director starts a
// transition to a new formation on a real track. The director reads two things: the rhythm state (kick onsets, novelty,
// chroma, song changes) and the bass energy envelope. The state comes from the same tracker pipeline the replay runs;
// the energy comes from one of two sources (`SetDirectorOptions.energy`): the analyser byte spectrum the scene reads,
// which `AnalyserNode` is emulated for below, or the hub's `gateBass.lowEnd`, which FU-S9-bass-ink-energy (S5) tried as
// the scene's input and rejected: on `syncopationbass` the hub input starts the first transition 0.8 to 0.9 s early (more
// than a beat at 98 BPM) whatever the ratio thresholds, and with the thresholds unchanged `lonley` and `beatless` change
// their count too (the table is in docs/plans/hub-followups/ledger.md). Both stay so the comparison can be repeated.
// Only the director's own code is the app's.
//
// Fidelity notes. The analyser is emulated from the post-gain audio with the Web Audio spec's own steps (a Blackman
// window over the last fftSize samples, magnitudes over fftSize, smoothing per call, then the dB-to-byte mapping), read
// once per 60 Hz render tick, only for the bins the scene sums (bins 1 to the bass cutoff). A browser reads it at the
// animation frame's real time and its smoothing steps per rendered block, so the levels differ slightly from a live
// run. The tracker's state reaches the director at batch arrival times exactly as in replay.ts. The scene clock here is
// the audio clock with no frame-time clamp.

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

    // One getByteFrequencyData call at the moment the audio has reached sample `end` (exclusive), as the scene's 0..1
    // bass level. Samples before the start of the audio read as silence.
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

// Where the energy envelope's input comes from.
export type EnergySource = 'hub' | 'analyser';

export interface SetDirectorOptions {
    // The envelope's input: what the app reads (default `DEFAULT_ENERGY_SOURCE`), or the other one for comparison.
    energy?: EnergySource;
}

// What the scene feeds its energy envelope, so a plain measure matches the app.
export const DEFAULT_ENERGY_SOURCE: EnergySource = 'analyser';

// Replays one track through the tracker and `bass-ink`'s energy envelope and set director on the 60 Hz render clock,
// and returns when the director started each transition. Deterministic.
export function measureSetDirector(
    track: string,
    pcm: Float32Array,
    sampleRate: number,
    options: SetDirectorOptions = {},
): SetDirectorMeasure {
    const useHub = (options.energy ?? DEFAULT_ENERGY_SOURCE) === 'hub';
    const audio = applyAgc(pcm, sampleRate);
    const extractor = new OnsetExtractor(sampleRate);
    const analyzer = new RhythmAnalyzer(extractor.frameRate);
    const state = analyzer.state;
    const bass = useHub ? undefined : new BassByteLevel(sampleRate);
    // The hub gets the same batches the tracker does, as replay.ts feeds it. Only its low end is read here, so it has no
    // gate-input reader and the band onsets exist only to give the frames their band energies.
    const hub = new AudioHub({ gateBass: { level: () => 0, dispose: () => {} } });
    const bandOnsets = useHub ? new BandOnsets(sampleRate, extractor.frameRate) : undefined;
    const onsetCapacity = BATCH_FRAMES * FEATURE_ONSET_BAND_COUNT;
    const batch: FeatureBatch = {
        version: FEATURE_MESSAGE_VERSION,
        time0: 0,
        count: 0,
        frames: new Float32Array(0),
        frameTimes: new Float64Array(BATCH_FRAMES),
        bandEnergy: new Float32Array(BATCH_FRAMES * HUB_BAND_COUNT),
        onsetCount: 0,
        onsetBand: new Uint8Array(onsetCapacity),
        onsetTime: new Float64Array(onsetCapacity),
        onsetStrength: new Float32Array(onsetCapacity),
    };
    const energy = new EnergyTracker();
    const director = new SetDirector();
    const dt = 1 / RENDER_HZ;
    const transitionTimes: number[] = [];

    let tick = 0;
    // One animation frame: the tracker's phase to the render time, the energy follows the chosen source, the director
    // reads both.
    const renderTick = (): void => {
        const time = tick * dt;
        tick++;
        analyzer.updatePhase(time);
        if (bass) {
            energy.update(bass.level(audio, Math.floor(time * sampleRate)), dt);
        } else {
            // After hub.update, as the scene reads it.
            hub.update(time);
            energy.update(hub.snapshot.gateBass.lowEnd, dt);
        }
        const before = director.cue.transitionCount;
        director.update(state, energy, time);
        if (director.cue.transitionCount !== before) transitionTimes.push(director.cue.transitionStart);
    };

    // The tracker analyzes whole batches of frames when the last of them arrives (see replay.ts); the render ticks
    // before that moment have not seen them.
    const frames = new Float32Array(BATCH_FRAMES * FRAME_STRIDE);
    const times = new Float64Array(BATCH_FRAMES);
    let queued = 0;
    const deliver = (arrival: number): void => {
        while (tick * dt < arrival) renderTick();
        for (let i = 0; i < queued; i++) {
            analyzer.pushFrame(times[i], frames, i * FRAME_STRIDE);
            analyzer.updatePhase(times[i]);
        }
        if (useHub) {
            batch.count = queued;
            batch.frameTimes.set(times.subarray(0, queued));
            hub.onBatch(batch);
        }
        queued = 0;
    };
    const blockSize = 128;
    for (let offset = 0; offset < audio.length; offset += blockSize) {
        extractor.push(audio.subarray(offset, Math.min(audio.length, offset + blockSize)), (frame) => {
            const time = (frame.endSample - FFT_SIZE / 2) / sampleRate;
            packFrame(frame, frames, queued * FRAME_STRIDE);
            times[queued] = time;
            if (bandOnsets) {
                bandOnsets.push(frame, time, () => {});
                batch.bandEnergy.set(bandOnsets.energy, queued * HUB_BAND_COUNT);
            }
            if (++queued === BATCH_FRAMES) deliver(time);
        });
    }
    const seconds = audio.length / sampleRate;
    while (tick * dt <= seconds) renderTick();
    return { track, transitionTimes };
}
