import { describe, expect, it } from 'vitest';
import { parseBeatSidecar, validateBeatSidecar } from './sidecar';

const valid = {
    track: 'song.wav',
    tempo: 120,
    beats: [0.5, 1, 1.5],
    source: 'synthetic',
    tapOffsetMs: 0,
    onsets: { kick: [0.5], bass: [], snare: [1], highs: [0.5, 1] },
};

function broken(change: Record<string, unknown>): string {
    return JSON.stringify({ ...valid, ...change });
}

describe('parseBeatSidecar', () => {
    it('reads a complete sidecar', () => {
        expect(parseBeatSidecar(JSON.stringify(valid))).toEqual(valid);
    });

    it('reads a tapped sidecar with a noise floor and no onsets', () => {
        const tapped = {
            track: 'a.wav',
            tempo: 90,
            beats: [],
            source: 'tapped',
            tapOffsetMs: -35,
            tapNoiseFloorMs: 12,
        };
        expect(parseBeatSidecar(JSON.stringify(tapped))).toEqual(tapped);
    });

    it('rejects text that is not JSON', () => {
        expect(() => parseBeatSidecar('{oops')).toThrow(/Not valid JSON/);
    });

    it('rejects values that are not objects', () => {
        expect(() => validateBeatSidecar(null)).toThrow('must be a JSON object, got null');
        expect(() => validateBeatSidecar([])).toThrow('must be a JSON object, got an array');
        expect(() => validateBeatSidecar(5)).toThrow('got 5');
    });

    it('names the field that is wrong', () => {
        expect(() => parseBeatSidecar(broken({ track: '' }))).toThrow('track must be the audio file name, got ""');
        expect(() => parseBeatSidecar(broken({ track: 3 }))).toThrow('track must be');
        expect(() => parseBeatSidecar(broken({ tempo: '120' }))).toThrow('tempo must be a finite number, got "120"');
        expect(() => parseBeatSidecar(broken({ tempo: 0 }))).toThrow('tempo must be above 0');
        expect(() => parseBeatSidecar(broken({ beats: 'x' }))).toThrow('beats must be an array');
        expect(() => parseBeatSidecar(broken({ beats: [1, 'a'] }))).toThrow('beats[1] must be a finite number');
        expect(() => parseBeatSidecar(broken({ beats: [1, null] }))).toThrow('got null');
        expect(() => parseBeatSidecar(broken({ beats: [2, 1] }))).toThrow('beats must be ascending');
        expect(() => parseBeatSidecar(broken({ source: 'guessed' }))).toThrow('source must be "synthetic" or "tapped"');
        expect(() => parseBeatSidecar(broken({ tapOffsetMs: undefined }))).toThrow(
            'tapOffsetMs must be a finite number',
        );
        expect(() => parseBeatSidecar(broken({ onsets: [] }))).toThrow('onsets must be an object');
        expect(() => parseBeatSidecar(broken({ onsets: { kick: [] } }))).toThrow('onsets.bass must be an array');
        expect(() => parseBeatSidecar(broken({ onsets: { ...valid.onsets, snare: [2, 1] } }))).toThrow(
            'onsets.snare must be ascending',
        );
        expect(() => parseBeatSidecar(broken({ tapNoiseFloorMs: 'x' }))).toThrow('tapNoiseFloorMs must be a finite');
        expect(() => parseBeatSidecar(broken({ tapNoiseFloorMs: -1 }))).toThrow('must not be negative');
    });
});
