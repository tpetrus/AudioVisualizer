import { describe, expect, it } from 'vitest';
import { BassByteLevel, measureSetDirector } from './setDirector';

const RATE = 44100;

// A steady sine of `hz` and `amplitude`, `seconds` long.
function tone(hz: number, amplitude: number, seconds: number): Float32Array {
    const pcm = new Float32Array(Math.round(seconds * RATE));
    for (let i = 0; i < pcm.length; i++) pcm[i] = amplitude * Math.sin((2 * Math.PI * hz * i) / RATE);
    return pcm;
}

// Reads the analyser every 1/60 s for `seconds`, as the scene does, and returns the last level.
function settle(reader: BassByteLevel, pcm: Float32Array, seconds: number): number {
    let level = 0;
    for (let tick = 0; tick <= seconds * 60; tick++) level = reader.level(pcm, Math.floor((tick / 60) * RATE));
    return level;
}

describe('BassByteLevel', () => {
    it('reads silence, and samples before the start of the audio, as 0', () => {
        const reader = new BassByteLevel(RATE);
        expect(settle(reader, new Float32Array(RATE), 1)).toBe(0);
        // The window reaches before the first sample, and past the last one.
        expect(reader.level(tone(60, 0.5, 0.01), 100)).toBeGreaterThanOrEqual(0);
        expect(reader.level(tone(60, 0.5, 0.01), 1e6)).toBeGreaterThanOrEqual(0);
    });

    it('settles on a steady tone, below 1, and takes several reads to get there (the analyser smooths)', () => {
        const pcm = tone(64.6, 0.25, 3);
        const reader = new BassByteLevel(RATE);
        const first = reader.level(pcm, 2 * RATE);
        const settled = settle(reader, pcm, 2.5);
        expect(first).toBeLessThan(settled);
        expect(settled).toBeGreaterThan(0.3);
        expect(settled).toBeLessThan(1);
        expect(reader.level(pcm, Math.floor(2.5 * RATE))).toBeCloseTo(settled, 2);
    });

    // A tone twice as loud is 6.02 dB higher in every bin, and the byte scale spans 70 dB over 255 steps.
    it('moves the level by the byte-scale share of 6 dB when the tone doubles', () => {
        const quiet = settle(new BassByteLevel(RATE), tone(64.6, 0.1, 3), 2.5);
        const loud = settle(new BassByteLevel(RATE), tone(64.6, 0.2, 3), 2.5);
        expect(loud - quiet).toBeCloseTo(6.02 / 70, 1);
    });

    it('does not see a tone above the bass cutoff', () => {
        expect(settle(new BassByteLevel(RATE), tone(2000, 0.5, 3), 2.5)).toBe(0);
    });
});

describe('measureSetDirector', () => {
    // The tracker raises a song change on digital silence on purpose, and the director gives a song change its own
    // transition after the coalesce time, so silence is not a track with none.
    it('names the track, and sees the song change the tracker raises on digital silence', () => {
        const result = measureSetDirector('silence.wav', new Float32Array(RATE * 8), RATE);
        expect(result.track).toBe('silence.wav');
        expect(result.transitionTimes).toEqual([4.05]);
    });

    it('is deterministic, and its transition times are in order and inside the track', () => {
        // Bass pulses at 120 BPM, then a cut to a tenth of the level, then the pulses back at full level: a build and a
        // drop.
        const pcm = new Float32Array(RATE * 40);
        for (let i = 0; i < pcm.length; i++) {
            const seconds = i / RATE;
            const beat = (seconds * 2) % 1;
            const level = seconds >= 20 && seconds < 26 ? 0.04 : 0.5;
            pcm[i] = level * Math.exp(-beat * 8) * Math.sin(2 * Math.PI * 55 * seconds);
        }
        const first = measureSetDirector('cut.wav', pcm, RATE);
        expect(measureSetDirector('cut.wav', pcm, RATE)).toEqual(first);
        expect(first.transitionTimes.length).toBeGreaterThanOrEqual(1);
        expect([...first.transitionTimes].sort((a, b) => a - b)).toEqual(first.transitionTimes);
        for (const time of first.transitionTimes) {
            expect(time).toBeGreaterThanOrEqual(0);
            expect(time).toBeLessThanOrEqual(40);
        }
    });
});
