import { OnsetExtractor, packFrame, type OnsetFrame } from '../../app/features/rhythm/onsetExtractor';
import { RhythmAnalyzer } from '../../app/features/rhythm/rhythmAnalyzer';
import { FFT_SIZE, FRAME_STRIDE } from '../../app/features/rhythm/rhythmConfig';
import type { AblationResult } from './ablateReport';

// Runs the real OnsetExtractor and RhythmAnalyzer over a recording, as runPipeline in testSignals.ts does, and records what
// the ablation report prints. The ablation script bundles this file with chosen rhythmConfig constants rewritten, so
// everything imported here sees the overridden values.
export function runAblation(
    pcm: Float32Array,
    sampleRate: number,
    everySeconds: number,
    blockSize = 128,
): AblationResult {
    const extractor = new OnsetExtractor(sampleRate);
    const analyzer = new RhythmAnalyzer(extractor.frameRate);
    const state = analyzer.state;
    const packed = new Float32Array(FRAME_STRIDE);
    const result: AblationResult = {
        sampleRate,
        frameRate: extractor.frameRate,
        seconds: pcm.length / sampleRate,
        firstLock: undefined,
        samples: [],
        gridRebuilds: [],
        songChanges: [],
    };
    let nextSample = 0;
    let lastEpoch = 0;
    let lastSongChanges = 0;

    const onFrame = (frame: OnsetFrame): void => {
        // The window is centred half its length before its end, exactly as the worklet computes the batch time.
        const time = (frame.endSample - FFT_SIZE / 2) / sampleRate;
        packFrame(frame, packed, 0);
        analyzer.pushFrame(time, packed, 0);
        analyzer.updatePhase(time);
        if (result.firstLock === undefined && analyzer.heldTempoBpm > 0) {
            result.firstLock = { time, held: analyzer.heldTempoBpm, raw: analyzer.rawTempoBpm };
        }
        // A hard reset sends the epoch back to 0; only a rise is a rebuild.
        if (analyzer.gridEpoch > lastEpoch) {
            result.gridRebuilds.push(time);
        }
        lastEpoch = analyzer.gridEpoch;
        if (state.songChangeCount > lastSongChanges) {
            result.songChanges.push(time);
            lastSongChanges = state.songChangeCount;
        }
        if (time >= nextSample) {
            nextSample = Math.floor(time / everySeconds + 1) * everySeconds;
            result.samples.push({ time, held: analyzer.heldTempoBpm, raw: analyzer.rawTempoBpm });
        }
    };

    for (let offset = 0; offset < pcm.length; offset += blockSize) {
        extractor.push(pcm.subarray(offset, Math.min(pcm.length, offset + blockSize)), onFrame);
    }
    return result;
}
