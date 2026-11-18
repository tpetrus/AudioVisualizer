import { describe, expect, it } from 'vitest';
import { EXPECTED_TRACKS, EXPECTED_TRACK_NAMES, resolveTrack } from './tracks';

describe('expected tracks', () => {
    it('lists 25 unique tracks, two of them generated in memory', () => {
        expect(EXPECTED_TRACK_NAMES).toHaveLength(25);
        expect(new Set(EXPECTED_TRACK_NAMES).size).toBe(25);
        expect(EXPECTED_TRACKS.filter((track) => track.generated).map((track) => track.name)).toEqual([
            'bassline-kick-120.wav',
            'pad-lead-groove-110.wav',
        ]);
    });

    it('classes the special tracks', () => {
        const classOf = (name: string) => EXPECTED_TRACKS.find((track) => track.name === name)?.class;
        expect(classOf('drifting-tempo.wav')).toBe('drifting');
        expect(classOf('beatless.wav')).toBe('beatless');
        expect(classOf('click-90.wav')).toBe('synthetic');
        expect(classOf('lonley.wav')).toBe('tapped');
    });

    it('flags the confirmed kick tracks and leaves the rest non-kick', () => {
        const kicks = EXPECTED_TRACKS.filter((track) => track.kick).map((track) => track.name);
        expect(kicks).toHaveLength(16);
        expect(kicks).toContain('bassline-kick-120.wav');
        expect(kicks).not.toContain('pad-lead-groove-110.wav');
        for (const name of ['drifting-tempo.wav', 'high-bpm-dnb.wav', 'low-bpm-rnb.wav', 'half-time-shuffle.wav']) {
            expect(kicks).toContain(name);
        }
        expect(kicks).not.toContain('6-8-time.wav');
        expect(kicks.some((name) => name.startsWith('click-'))).toBe(false);
    });
});

describe('resolveTrack', () => {
    it('uses the sidecar source for a listed track', () => {
        expect(resolveTrack('click-90.wav', 'synthetic')).toEqual({ class: 'synthetic', kick: false });
        expect(resolveTrack('lonley.wav', 'tapped')).toEqual({ class: 'tapped', kick: true });
    });

    it('lets the overrides win over the sidecar', () => {
        expect(resolveTrack('drifting-tempo.wav', 'tapped').class).toBe('drifting');
        expect(resolveTrack('beatless.wav').class).toBe('beatless');
    });

    it('keeps the listed class when the sidecar is missing', () => {
        expect(resolveTrack('drums-100.wav')).toEqual({ class: 'synthetic', kick: true });
        expect(resolveTrack('summer2000.wav').class).toBe('tapped');
    });

    it('treats an unlisted name as a non-kick track classed by its sidecar, tapped by default', () => {
        expect(resolveTrack('mystery.wav', 'synthetic')).toEqual({ class: 'synthetic', kick: false });
        expect(resolveTrack('mystery.wav')).toEqual({ class: 'tapped', kick: false });
    });
});
