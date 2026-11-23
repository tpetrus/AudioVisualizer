import { BandOnsets } from '../bandOnsets';
import { OnsetExtractor, packFrame } from '../onsetExtractor';
import { RhythmAnalyzer } from '../rhythmAnalyzer';
import { BATCH_FRAMES, FEATURE_ONSET_BAND_COUNT, FFT_SIZE, FRAME_STRIDE, HUB_BAND_COUNT } from '../rhythmConfig';
import { addNoise, concat, renderTrack, silence, TEST_SAMPLE_RATE } from '../testSignals';
import { FEATURE_MESSAGE_VERSION, type FeatureBatch } from '../types';

// The messages the worklet would post for a recording, built from the real OnsetExtractor and BandOnsets the way the
// scorecard replay packs them: BATCH_FRAMES frames per batch, the events decided while a batch's frames were analysed
// (so often older than the batch's first frame), a trailing partial batch dropped. Each batch has its own buffers, as
// a transferred message does.
export function buildFeatureBatches(pcm: Float32Array, sampleRate: number): FeatureBatch[] {
    const extractor = new OnsetExtractor(sampleRate);
    const bandOnsets = new BandOnsets(sampleRate, extractor.frameRate);
    const batches: FeatureBatch[] = [];
    const onsetCapacity = BATCH_FRAMES * FEATURE_ONSET_BAND_COUNT;
    let batch: FeatureBatch | undefined;
    const onOnset = (band: number, time: number, strength: number): void => {
        if (!batch || batch.onsetCount >= onsetCapacity) return;
        batch.onsetBand[batch.onsetCount] = band;
        batch.onsetTime[batch.onsetCount] = time;
        batch.onsetStrength[batch.onsetCount] = strength;
        batch.onsetCount++;
    };
    for (let offset = 0; offset < pcm.length; offset += 128) {
        extractor.push(pcm.subarray(offset, Math.min(pcm.length, offset + 128)), (frame) => {
            const time = (frame.endSample - FFT_SIZE / 2) / sampleRate;
            if (!batch) {
                batch = {
                    version: FEATURE_MESSAGE_VERSION,
                    time0: time,
                    count: 0,
                    frames: new Float32Array(BATCH_FRAMES * FRAME_STRIDE),
                    frameTimes: new Float64Array(BATCH_FRAMES),
                    bandEnergy: new Float32Array(BATCH_FRAMES * HUB_BAND_COUNT),
                    onsetCount: 0,
                    onsetBand: new Uint8Array(onsetCapacity),
                    onsetTime: new Float64Array(onsetCapacity),
                    onsetStrength: new Float32Array(onsetCapacity),
                };
            }
            packFrame(frame, batch.frames, batch.count * FRAME_STRIDE);
            batch.frameTimes[batch.count] = time;
            bandOnsets.push(frame, time, onOnset);
            batch.bandEnergy.set(bandOnsets.energy, batch.count * HUB_BAND_COUNT);
            if (++batch.count === BATCH_FRAMES) {
                batches.push(batch);
                batch = undefined;
            }
        });
    }
    return batches;
}

const FNV_OFFSET = 0x811c9dc5;
const FNV_PRIME = 0x01000193;

// A rolling FNV-1a hash over the exact bits of the Float64 values added to it, so the smallest change in any value shows
// in the digest.
class Digest {
    private hash = FNV_OFFSET;
    private readonly scratch = new Float64Array(1);
    private readonly words = new Uint32Array(this.scratch.buffer);

    add(value: number): void {
        this.scratch[0] = value;
        for (let i = 0; i < 2; i++) {
            let word = this.words[i];
            for (let b = 0; b < 4; b++) {
                this.hash = Math.imul(this.hash ^ (word & 0xff), FNV_PRIME) >>> 0;
                word >>>= 8;
            }
        }
    }

    toString(): string {
        return this.hash.toString(16).padStart(8, '0');
    }
}

// Runs the batches through a fresh analyzer the way the tracker does (each frame at time0 + i / frameRate, the phase
// read after every frame) and hashes the state after every frame: beat phase, next beat, beat count, bar phase, tempo,
// tempo confidence, grid epoch, phase-shift count, song-change count and downbeat count. With `kicks` every batch's
// events are given to the analyzer first, which must not change the digest while nothing reads them.
export function digestBatches(batches: readonly FeatureBatch[], frameRate: number, kicks: boolean): string {
    const analyzer = new RhythmAnalyzer(frameRate);
    const state = analyzer.state;
    const digest = new Digest();
    for (const batch of batches) {
        if (kicks) {
            analyzer.pushKicks(batch.onsetBand, batch.onsetTime, batch.onsetStrength, batch.onsetCount);
        }
        for (let i = 0; i < batch.count; i++) {
            const time = batch.time0 + i / frameRate;
            analyzer.pushFrame(time, batch.frames, i * FRAME_STRIDE);
            analyzer.updatePhase(time);
            digest.add(state.beatPhase ?? -1);
            digest.add(state.nextBeatTime);
            digest.add(state.beatCount);
            digest.add(state.barPhase ?? -1);
            digest.add(state.bpm);
            digest.add(state.tempoConfidence);
            digest.add(analyzer.gridEpoch);
            digest.add(analyzer.beat.phaseShiftCount);
            digest.add(state.songChangeCount);
            digest.add(state.downbeatCount);
        }
    }
    return digest.toString();
}

// The recordings the golden digests are taken over: a steady kick, a track with no kick at all, and a song change from
// a 4/4 kick track to a faster 3/4 one with another click.
export function goldenTracks(): { name: string; pcm: Float32Array }[] {
    const sampleRate = TEST_SAMPLE_RATE;
    return [
        { name: 'steady kick', pcm: renderTrack({ seconds: 24, bpm: 120, beatsPerBar: 4, sampleRate }).pcm },
        { name: 'no kick', pcm: addNoise(silence(24, sampleRate), 0.05, 7) },
        {
            name: 'song change',
            pcm: concat(
                renderTrack({ seconds: 16, bpm: 110, beatsPerBar: 4, sampleRate }).pcm,
                silence(1, sampleRate),
                renderTrack({ seconds: 16, bpm: 140, beatsPerBar: 3, clickHz: 2000, sampleRate }).pcm,
            ),
        },
    ];
}
