import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { parseBeatSidecar } from '../../app/features/rhythm/eval/sidecar';
import {
    GROUND_TRUTH_SAMPLE_RATE,
    GROUND_TRUTH_TRACKS,
    renderGroundTruthTrack,
    type TrackSpec,
    type Voice,
} from './render';

const SIDECAR_DIR = fileURLToPath(new URL('./sidecars', import.meta.url));

// Zero crossings per second halved: a rough pitch of the signal, enough to tell a thump from a hiss.
function roughHz(pcm: Float32Array): number {
    let crossings = 0;
    for (let i = 1; i < pcm.length; i++) {
        if (pcm[i - 1] < 0 !== pcm[i] < 0) crossings++;
    }
    return crossings / 2 / (pcm.length / GROUND_TRUTH_SAMPLE_RATE);
}

function oneVoice(voice: Voice): TrackSpec {
    return { name: voice, bpm: 120, seconds: 6, beatsPerBar: 4, pattern: [{ voice, beat: 0, level: 1 }] };
}

describe('the committed sidecars', () => {
    it('are reproduced by the generator, one file for every track', () => {
        const files = readdirSync(SIDECAR_DIR).filter((name) => name.endsWith('.beats.json'));
        expect(files.sort()).toEqual(GROUND_TRUTH_TRACKS.map((spec) => `${spec.name}.beats.json`).sort());
        for (const spec of GROUND_TRUTH_TRACKS) {
            const committed = parseBeatSidecar(readFileSync(join(SIDECAR_DIR, `${spec.name}.beats.json`), 'utf8'));
            expect(committed, spec.name).toEqual(renderGroundTruthTrack(spec).sidecar);
        }
    });
});

describe('renderGroundTruthTrack', () => {
    const drums = GROUND_TRUTH_TRACKS.find((spec) => spec.name === 'drums-128') as TrackSpec;
    const rendered = renderGroundTruthTrack(drums);

    it('is deterministic', () => {
        const again = renderGroundTruthTrack(drums);
        expect(again.sidecar).toEqual(rendered.sidecar);
        expect(again.pcm).toEqual(rendered.pcm);
    });

    it('writes a synthetic sidecar with exact beats and onsets', () => {
        const { sidecar, pcm } = rendered;
        expect(sidecar).toMatchObject({ track: 'drums-128.wav', tempo: 128, source: 'synthetic', tapOffsetMs: 0 });
        expect(pcm.length).toBe(30 * GROUND_TRUTH_SAMPLE_RATE);
        const beat = 60 / 128;
        expect(sidecar.beats[0]).toBe(0.5);
        expect(sidecar.beats[1] - sidecar.beats[0]).toBeCloseTo(beat, 5);
        expect(sidecar.beats.at(-1)).toBeLessThan(30 - 0.3);
        // Kick on 1 and 3, snare on 2 and 4, a hat on every eighth, bass on three offbeats: per bar 2, 2, 8 and 3.
        const bars = Math.ceil(sidecar.beats.length / 4);
        expect(sidecar.onsets?.kick.length).toBeGreaterThanOrEqual((bars - 1) * 2);
        expect(sidecar.onsets?.highs.length).toBeGreaterThan(sidecar.onsets?.snare.length ?? 0);
        expect(sidecar.onsets?.kick[0]).toBe(0.5);
        expect(sidecar.onsets?.bass[0]).toBeCloseTo(0.5 + beat / 2, 5);
        for (const times of Object.values(sidecar.onsets ?? {})) {
            expect(times).toEqual([...times].sort((a, b) => a - b));
        }
    });

    it('keeps the samples out of clipping', () => {
        let peak = 0;
        for (const sample of rendered.pcm) peak = Math.max(peak, Math.abs(sample));
        expect(peak).toBeLessThanOrEqual(0.95 + 1e-6);
    });

    it('puts every onset where the audio has energy', () => {
        const window = Math.round(0.02 * GROUND_TRUTH_SAMPLE_RATE);
        for (const time of rendered.sidecar.onsets?.kick ?? []) {
            const start = Math.round(time * GROUND_TRUTH_SAMPLE_RATE);
            let energy = 0;
            for (let i = start; i < start + window; i++) energy += rendered.pcm[i] ** 2;
            expect(energy).toBeGreaterThan(0.01);
        }
    });

    it('gives each voice its own part of the spectrum', () => {
        // The first hit starts 0.5 s in; look at its first 30 ms.
        const hz = (voice: Voice) => {
            const start = Math.round(0.5 * GROUND_TRUTH_SAMPLE_RATE);
            return roughHz(renderGroundTruthTrack(oneVoice(voice)).pcm.subarray(start, start + 1323));
        };
        expect(hz('kick')).toBeLessThan(120);
        expect(hz('bass')).toBeGreaterThan(hz('kick'));
        expect(hz('bass')).toBeLessThan(300);
        expect(hz('click')).toBeGreaterThan(700);
        expect(hz('snare')).toBeGreaterThan(500);
        expect(hz('snare')).toBeLessThan(hz('highs'));
        expect(hz('highs')).toBeGreaterThan(2500);
    });

    it('has the traps and the kickless pattern the plan asks for', () => {
        const names = GROUND_TRUTH_TRACKS.map((spec) => spec.name);
        expect(names).toEqual(
            expect.arrayContaining(['click-90', 'click-120', 'click-140', 'click-174', 'trap-4to3-120', 'no-kick-124']),
        );
        expect(names.filter((name) => name.startsWith('trap-2to1')).length).toBeGreaterThanOrEqual(1);
        const noKick = renderGroundTruthTrack(GROUND_TRUTH_TRACKS.find((s) => s.name === 'no-kick-124') as TrackSpec);
        expect(noKick.sidecar.onsets?.kick).toEqual([]);
        // The 4:3 trap's loud kicks are 0.75 beat apart.
        const trap = renderGroundTruthTrack(GROUND_TRUTH_TRACKS.find((s) => s.name === 'trap-4to3-120') as TrackSpec);
        const kicks = trap.sidecar.onsets?.kick ?? [];
        expect(kicks[1] - kicks[0]).toBeCloseTo(0.75 * 0.5, 5);
    });
});
