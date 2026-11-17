import { describe, expect, it } from 'vitest';
import { renderTrack, silence, TEST_SAMPLE_RATE } from '../../../app/features/rhythm/testSignals';
import { GROUND_TRUTH_TRACKS, renderGroundTruthTrack } from '../../ground-truth/render';
import { measureTrack } from './measureTrack';

const click = renderTrack({ seconds: 20, bpm: 120, beatsPerBar: 4 });
const input = { pcm: click.pcm, sampleRate: TEST_SAMPLE_RATE };

describe('measureTrack on a tapped track', () => {
    it('measures a locked click track against its bpm', () => {
        const measures = measureTrack({ track: 'click.wav', class: 'tapped', bpm: 120, ...input });
        expect(measures.track).toBe('click.wav');
        expect(measures.class).toBe('tapped');
        expect(measures.seconds).toBe(20);
        expect(measures.everLocked).toBe(true);
        expect(measures.lockSeconds).toBeGreaterThan(2);
        expect(measures.lockSeconds).toBeLessThan(6);
        expect(measures.tempoWithinShareAfterLock).toBe(1);
        expect(measures.maxTempoErrorAfterLock).toBeLessThanOrEqual(0.02);
        expect(measures.falseSongChanges).toBe(0);
        expect(measures.gateFirstOpenSeconds).not.toBeNull();
        expect(measures.gateOpenShare).toBeGreaterThan(0.9);
        // No sidecar: no beats to compare with and no onset labels.
        expect(measures.beatErrorMedianMs).toBeNull();
        expect(measures.onsetF50).toBeNull();
    });

    it('counts an octave of the truth as the right tempo', () => {
        const half = measureTrack({ track: 'click.wav', class: 'tapped', bpm: 60, ...input });
        expect(half.everLocked).toBe(true);
        expect(half.lockSeconds).not.toBeNull();
    });

    it('does not count the dotted rival as the right tempo', () => {
        const wrong = measureTrack({ track: 'click.wav', class: 'tapped', bpm: 90, ...input });
        expect(wrong.everLocked).toBe(false);
        expect(wrong.lockSeconds).toBeNull();
        expect(wrong.tempoWithinShareAfterLock).toBeNull();
        expect(wrong.maxTempoErrorAfterLock).toBeNull();
    });

    it('prefers the sidecar tempo and reports the beat error', () => {
        const sidecar = {
            track: 'click.wav',
            tempo: 120,
            beats: click.beatTimes,
            source: 'tapped' as const,
            tapOffsetMs: 0,
        };
        const measures = measureTrack({ track: 'click.wav', class: 'tapped', bpm: 90, sidecar, ...input });
        expect(measures.everLocked).toBe(true);
        expect(measures.beatErrorMedianMs).not.toBeNull();
        expect(measures.beatErrorMedianMs!).toBeLessThan(30);
        // A tapped sidecar has no onset labels.
        expect(measures.onsetF50).toBeNull();
    });

    it('needs a tempo', () => {
        expect(() => measureTrack({ track: 'click.wav', class: 'tapped', ...input })).toThrow(/needs a tempo/);
    });
});

describe('measureTrack on a drifting track', () => {
    it('compares with the local tempo of the tapped beats', () => {
        const sidecar = {
            track: 'drift.wav',
            tempo: 100,
            beats: click.beatTimes,
            source: 'tapped' as const,
            tapOffsetMs: 0,
        };
        // The sidecar's own tempo is wrong on purpose: only the local tempo of the beats (120) can pass.
        const drifting = measureTrack({ track: 'drift.wav', class: 'drifting', sidecar, ...input });
        const tapped = measureTrack({ track: 'drift.wav', class: 'tapped', bpm: 120, ...input });
        expect(drifting.everLocked).toBe(true);
        expect(drifting.lockSeconds).toBe(tapped.lockSeconds);
        expect(drifting.tempoWithinShareAfterLock).toBe(1);
    });
});

describe('measureTrack on a beatless track', () => {
    it('reports no lock for silence', () => {
        const measures = measureTrack({
            track: 'drone.wav',
            class: 'beatless',
            pcm: silence(8),
            sampleRate: TEST_SAMPLE_RATE,
        });
        expect(measures.everLocked).toBe(false);
        expect(measures.lockSeconds).toBeNull();
        expect(measures.tempoWithinShareAfterLock).toBeNull();
        expect(measures.maxTempoErrorAfterLock).toBeNull();
        expect(measures.beatErrorMedianMs).toBeNull();
        expect(measures.gateFirstOpenSeconds).toBeNull();
        expect(measures.gateOpenShare).toBe(0);
    });

    it('reports a lock when the tracker finds a beat anyway', () => {
        const measures = measureTrack({ track: 'beaty.wav', class: 'beatless', ...input });
        expect(measures.everLocked).toBe(true);
    });
});

describe('measureTrack on a synthetic track', () => {
    const spec = GROUND_TRUTH_TRACKS.find((candidate) => candidate.name === 'drums-128')!;
    const rendered = renderGroundTruthTrack({ ...spec, seconds: 20 });
    const measure = () =>
        measureTrack({
            track: rendered.sidecar.track,
            class: 'synthetic',
            pcm: rendered.pcm,
            sampleRate: TEST_SAMPLE_RATE,
            sidecar: rendered.sidecar,
        });

    it('scores the labelled onset bands at 50 ms and the beat error', () => {
        const measures = measure();
        expect(measures.everLocked).toBe(true);
        expect(Object.keys(measures.onsetF50!).sort()).toEqual(['bass', 'highs', 'kick', 'snare']);
        for (const f of Object.values(measures.onsetF50!)) expect(f).toBeGreaterThan(0.8);
        expect(measures.beatErrorMedianMs).not.toBeNull();
    });

    it('leaves out a band with no labels', () => {
        const clicks = GROUND_TRUTH_TRACKS.find((candidate) => candidate.name === 'click-120')!;
        const track = renderGroundTruthTrack({ ...clicks, seconds: 12 });
        const measures = measureTrack({
            track: track.sidecar.track,
            class: 'synthetic',
            pcm: track.pcm,
            sampleRate: TEST_SAMPLE_RATE,
            sidecar: track.sidecar,
        });
        expect(Object.keys(measures.onsetF50!)).toEqual(['snare']);
    });

    it('is deterministic', () => {
        expect(measure()).toEqual(measure());
    });
});
