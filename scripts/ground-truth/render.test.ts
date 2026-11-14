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

// Magnitude of one frequency in `pcm` (a single DFT bin), to find a note's fundamental in the audio.
function magnitudeAt(pcm: Float32Array, hz: number): number {
    const w = (2 * Math.PI * hz) / GROUND_TRUTH_SAMPLE_RATE;
    let re = 0;
    let im = 0;
    for (let i = 0; i < pcm.length; i++) {
        re += pcm[i] * Math.cos(w * i);
        im += pcm[i] * Math.sin(w * i);
    }
    return Math.hypot(re, im) / pcm.length;
}

function named(name: string): TrackSpec {
    return GROUND_TRUTH_TRACKS.find((spec) => spec.name === name) as TrackSpec;
}

describe('the distractor and pitched-bass tracks', () => {
    const padLead = named('pad-lead-groove-110');
    const bassLine = named('bassline-kick-120');

    it('keep the pad and lead out of the sidecar', () => {
        const { sidecar } = renderGroundTruthTrack(padLead);
        // Only the drums are labelled: per bar 2 kicks and 2 snares, and no bass onsets.
        expect(sidecar.onsets?.bass).toEqual([]);
        expect(sidecar.onsets?.kick.length).toBeGreaterThanOrEqual(2 * (Math.ceil(sidecar.beats.length / 4) - 1));
        expect(sidecar.onsets?.snare.length).toBeGreaterThanOrEqual(2 * (Math.ceil(sidecar.beats.length / 4) - 1));
        expect(padLead.pattern.some((hit) => hit.voice === 'pad')).toBe(true);
        expect(padLead.pattern.some((hit) => hit.voice === 'lead')).toBe(true);
        // The lead sounds on every beat, yet the first snare label is still the second beat of the first bar.
        expect(sidecar.onsets?.snare[0]).toBeCloseTo(0.5 + 60 / 110, 5);
    });

    it('puts the pad in the low-mid band and the lead in the mid band, with a slow attack', () => {
        const pcm = renderGroundTruthTrack(padLead).pcm;
        // A window inside the second beat of the first bar: the first chord has 220 Hz, the lead note 987.8 Hz.
        const start = Math.round((0.5 + (60 / 110) * 1.2) * GROUND_TRUTH_SAMPLE_RATE);
        const window = pcm.subarray(start, start + 8820);
        expect(magnitudeAt(window, 220)).toBeGreaterThan(0.005);
        expect(magnitudeAt(window, 987.8)).toBeGreaterThan(0.005);
        for (const hz of padLead.chords?.flat() ?? []) {
            expect(hz).toBeGreaterThanOrEqual(130);
            expect(hz).toBeLessThan(800);
        }
        for (const hit of padLead.pattern.filter((h) => h.voice === 'lead')) {
            expect(hit.pitchHz).toBeGreaterThanOrEqual(800);
            expect(hit.pitchHz).toBeLessThan(4000);
        }
        // A slow attack: the first 5 ms of a pad is nearly silent compared with its body.
        const padOnly = renderGroundTruthTrack({
            ...padLead,
            pattern: padLead.pattern.filter((h) => h.voice === 'pad'),
        }).pcm;
        const rms = (from: number, length: number) => {
            let sum = 0;
            for (let i = from; i < from + length; i++) sum += padOnly[i] ** 2;
            return Math.sqrt(sum / length);
        };
        const first = Math.round(0.5 * GROUND_TRUTH_SAMPLE_RATE);
        expect(rms(first, 220)).toBeLessThan(rms(first + 22050, 220) / 20);
    });

    it('changes the pad chord every bar', () => {
        const chords = padLead.chords ?? [];
        expect(chords.length).toBeGreaterThan(1);
        expect(new Set(chords.map((chord) => chord.join())).size).toBe(chords.length);
    });

    it('spans 41 to 98 Hz in the bass notes, with the fundamental in the audio', () => {
        const pitches = bassLine.pattern.filter((h) => h.voice === 'bass').map((h) => h.pitchHz as number);
        expect(Math.min(...pitches)).toBeGreaterThanOrEqual(41);
        expect(Math.min(...pitches)).toBeLessThan(42);
        expect(Math.max(...pitches)).toBeLessThanOrEqual(98);
        expect(Math.max(...pitches)).toBeGreaterThan(97);
        for (const pitchHz of pitches) {
            const one: TrackSpec = {
                name: 'one',
                bpm: 120,
                seconds: 3,
                beatsPerBar: 4,
                pattern: [{ voice: 'bass', beat: 0, level: 1, pitchHz }],
            };
            const start = Math.round(0.5 * GROUND_TRUTH_SAMPLE_RATE);
            const note = renderGroundTruthTrack(one).pcm.subarray(start, start + 8820);
            expect(magnitudeAt(note, pitchHz)).toBeGreaterThan(magnitudeAt(note, pitchHz * 1.5) * 5);
        }
    });

    it('labels bass notes bass and kicks kick', () => {
        const { sidecar } = renderGroundTruthTrack(bassLine);
        const bars = Math.ceil(sidecar.beats.length / 4);
        expect(sidecar.onsets?.kick.length).toBeGreaterThanOrEqual(4 * (bars - 1));
        expect(sidecar.onsets?.bass.length).toBeGreaterThanOrEqual(6 * (bars - 1));
        expect(sidecar.onsets?.snare).toEqual([]);
        expect(sidecar.onsets?.highs).toEqual([]);
    });

    it('is deterministic', () => {
        for (const spec of [padLead, bassLine]) {
            const a = renderGroundTruthTrack(spec);
            const b = renderGroundTruthTrack(spec);
            expect(b.pcm).toEqual(a.pcm);
            expect(b.sidecar).toEqual(a.sidecar);
        }
    });

    it('leaves the unpitched bass note as it was', () => {
        const pcm = renderGroundTruthTrack(oneVoice('bass')).pcm;
        const start = Math.round(0.5 * GROUND_TRUTH_SAMPLE_RATE);
        const t = 0.1;
        const expected = 0.35 * (Math.sin(2 * Math.PI * 110 * t) + 0.3 * Math.sin(2 * Math.PI * 220 * t));
        expect(pcm[start + Math.round(t * GROUND_TRUTH_SAMPLE_RATE)]).toBeCloseTo(expected, 3);
    });
});
