import { detectFromPcm } from '../../app/features/rhythm/eval/detect';
import { buildEvalReport } from '../../app/features/rhythm/eval/evalReport';
import { ONSET_BANDS, type OnsetBand } from '../../app/features/rhythm/eval/evalTypes';
import { GROUND_TRUTH_SAMPLE_RATE, GROUND_TRUTH_TRACKS, renderGroundTruthTrack } from '../ground-truth/render';
import type { SyntheticResult } from './onsetSweep';

// Bundled by scripts/onset-sweep.ts once per grid point with rhythmConfig constants rewritten, so the detector run here
// sees the overridden values. Kept thin: the scoring happens outside the bundle.

export interface LocalInput {
    name: string;
    pcm: Float32Array;
    sampleRate: number;
}

export interface LocalOnsets {
    name: string;
    onsets: Record<OnsetBand, number[]>;
}

const GATE_TOLERANCE_MS = 50;

// F at 50 ms per labelled band for every synthetic ground-truth track.
export function runSynthetic(): SyntheticResult[] {
    return GROUND_TRUTH_TRACKS.map((spec) => {
        const { pcm, sidecar } = renderGroundTruthTrack(spec);
        const report = buildEvalReport(sidecar, detectFromPcm(pcm, GROUND_TRUTH_SAMPLE_RATE));
        const scores = report.onsets.find((entry) => entry.toleranceMs === GATE_TOLERANCE_MS)?.bands ?? {};
        const f: SyntheticResult['f'] = {};
        for (const band of ONSET_BANDS) {
            const score = scores[band];
            // A band the track has no labels for is left out of the check.
            if (score !== undefined && (sidecar.onsets?.[band].length ?? 0) > 0) f[band] = score.f;
        }
        return { track: spec.name, f };
    });
}

export function runLocal(inputs: readonly LocalInput[]): LocalOnsets[] {
    return inputs.map(({ name, pcm, sampleRate }) => ({ name, onsets: detectFromPcm(pcm, sampleRate).onsets }));
}
