import { describe, expect, it } from 'vitest';
import { validateBeatSidecar } from '../../app/features/rhythm/eval/sidecar';
import { beatsSidecarName, buildTappedSidecar } from './sidecar';

const calibration = { offsetMs: 40, noiseFloorMs: 15, taps: 10, track: 'click.wav' };

describe('beatsSidecarName', () => {
    it('replaces the extension', () => {
        expect(beatsSidecarName('song.one.mp3')).toBe('song.one.beats.json');
        expect(beatsSidecarName('dir/song.wav')).toBe('song.beats.json');
        expect(beatsSidecarName('noext')).toBe('noext.beats.json');
    });
});

describe('buildTappedSidecar', () => {
    const taps = [1.04, 1.54, 2.04, 2.54];

    it('subtracts the offset and takes the tempo from the taps', () => {
        const sidecar = buildTappedSidecar({ track: 'song.mp3', taps, calibration, bpmSidecar: undefined });
        expect(sidecar.beats.map((b) => Math.round(b * 1000))).toEqual([1000, 1500, 2000, 2500]);
        expect(sidecar).toMatchObject({ source: 'tapped', tapOffsetMs: 40, tapNoiseFloorMs: 15, track: 'song.mp3' });
        expect(sidecar.tempo).toBeCloseTo(120);
        expect(() => validateBeatSidecar(JSON.parse(JSON.stringify(sidecar)))).not.toThrow();
    });

    it('prefers the .bpm sidecar', () => {
        expect(buildTappedSidecar({ track: 's.mp3', taps, calibration, bpmSidecar: 90 }).tempo).toBe(90);
    });

    it('fails without any tempo source', () => {
        expect(() => buildTappedSidecar({ track: 's', taps: [1], calibration, bpmSidecar: undefined })).toThrow(
            /tempo/,
        );
    });
});
