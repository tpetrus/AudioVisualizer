import { describe, expect, it } from 'vitest';
import { BandOnsets, ringSizeFor } from './bandOnsets';
import { OnsetExtractor } from './onsetExtractor';
import {
    FEATURE_ONSET_BANDS,
    FFT_SIZE,
    HUB_BAND_COUNT,
    HUB_BAND_EDGES_HZ,
    BAND_ONSET_REFRACTORY_FRAMES,
    BAND_ONSET_PAST_FRAMES,
    LOW_ONSET_LAG_FRAMES,
    ONSET_LOOKAHEAD_FRAMES,
} from './rhythmConfig';
import { TEST_SAMPLE_RATE, silence } from './testSignals';

const KICK = FEATURE_ONSET_BANDS.indexOf('kick');
const BASS = FEATURE_ONSET_BANDS.indexOf('bass');
const SNARE = FEATURE_ONSET_BANDS.indexOf('snare');
const HIGHS = FEATURE_ONSET_BANDS.indexOf('highs');

interface Event {
    band: number;
    time: number;
    strength: number;
    // The time of the frame at whose arrival the event was decided.
    decidedAt: number;
}

interface Run {
    events: Event[];
    energy: number[][];
    frameTimes: number[];
}

// Feeds PCM through the real extractor and detector the way the worklet does.
function run(pcm: Float32Array, sampleRate = TEST_SAMPLE_RATE, detector?: BandOnsets): Run {
    const extractor = new OnsetExtractor(sampleRate);
    const onsets = detector ?? new BandOnsets(sampleRate, extractor.frameRate);
    const result: Run = { events: [], energy: [], frameTimes: [] };
    let now = 0;
    const sink = (band: number, time: number, strength: number): void => {
        result.events.push({ band, time, strength, decidedAt: now });
    };
    for (let offset = 0; offset < pcm.length; offset += 128) {
        extractor.push(pcm.subarray(offset, Math.min(pcm.length, offset + 128)), (frame) => {
            now = (frame.endSample - FFT_SIZE / 2) / sampleRate;
            onsets.push(frame.logMagnitude, now, sink);
            result.energy.push(Array.from(onsets.energy));
            result.frameTimes.push(now);
        });
    }
    return result;
}

// Adds `voice(t)` for `seconds` starting at `start` seconds.
function addHit(pcm: Float32Array, start: number, seconds: number, voice: (t: number) => number): void {
    const first = Math.round(start * TEST_SAMPLE_RATE);
    for (let i = 0; i < Math.round(seconds * TEST_SAMPLE_RATE) && first + i < pcm.length; i++) {
        pcm[first + i] += voice(i / TEST_SAMPLE_RATE);
    }
}

// A drum thump: a sine sweeping from about 100 Hz down to 45 Hz.
function addKick(pcm: Float32Array, start: number, level = 1): void {
    let phase = 0;
    addHit(pcm, start, 0.3, (t) => {
        phase += (2 * Math.PI * (45 + 55 * Math.exp(-t / 0.03))) / TEST_SAMPLE_RATE;
        return 0.8 * level * Math.exp(-t / 0.07) * Math.sin(phase);
    });
}

// A sustained chord at 174 to 330 Hz with second harmonics that fades in over `attack` seconds and whose amplitude ripples a
// little 8 times a second, like the pads of a real mix. The partials beat against each other too.
function addPad(pcm: Float32Array, start: number, seconds: number, attack: number): void {
    addHit(pcm, start, seconds, (t) => {
        const ripple = 1 + 0.05 * Math.sin(2 * Math.PI * 8 * t);
        let sum = 0;
        for (const hz of [220, 261.6, 329.6]) {
            sum += Math.sin(2 * Math.PI * hz * t) + 0.3 * Math.sin(4 * Math.PI * hz * t);
        }
        return 0.12 * Math.min(1, t / attack) * ripple * (sum / 3);
    });
}

// A bass note: a steady 110 Hz tone with a short attack and release.
function addBass(pcm: Float32Array, start: number, level = 1): void {
    addHit(pcm, start, 0.3, (t) => {
        const attack = Math.min(1, t / 0.005);
        const release = Math.min(1, (0.3 - t) / 0.06);
        const wave = Math.sin(2 * Math.PI * 110 * t) + 0.3 * Math.sin(2 * Math.PI * 220 * t);
        return 0.35 * level * attack * release * wave;
    });
}

// A mid-range burst (a snare's body) with a soft attack so that it leaks little into the other ranges.
function addSnare(pcm: Float32Array, start: number, level = 1): void {
    addHit(pcm, start, 0.15, (t) => {
        const attack = Math.min(1, t / 0.004);
        let sum = 0;
        for (const hz of [900, 1300, 1700, 2300, 3100]) sum += Math.sin(2 * Math.PI * hz * t);
        return 0.15 * level * attack * Math.exp(-t / 0.04) * sum;
    });
}

// A high-range burst.
function addHat(pcm: Float32Array, start: number, level = 1): void {
    addHit(pcm, start, 0.05, (t) => {
        let sum = 0;
        for (const hz of [6500, 8200, 9700, 11300]) sum += Math.sin(2 * Math.PI * hz * t);
        return 0.15 * level * Math.exp(-t / 0.012) * sum;
    });
}

const bandsOf = (events: Event[]): number[] => events.map((event) => event.band);

describe('BandOnsets energy', () => {
    it('is the mean log magnitude of each hub band, loudest in the band that holds the tone', () => {
        const tone = new Float32Array(TEST_SAMPLE_RATE / 2);
        addHit(tone, 0, 0.5, (t) => 0.5 * Math.sin(2 * Math.PI * 1000 * t));
        const { energy } = run(tone);
        const last = energy[energy.length - 1];
        expect(last).toHaveLength(HUB_BAND_COUNT);
        const loudest = last.indexOf(Math.max(...last));
        expect(HUB_BAND_EDGES_HZ[loudest]).toBeLessThanOrEqual(1000);
        expect(HUB_BAND_EDGES_HZ[loudest + 1]).toBeGreaterThan(1000);
    });

    it('is zero for silence and gives every band a bin at a low sample rate', () => {
        const lowRate = 8000;
        const tone = new Float32Array(lowRate);
        for (let i = 0; i < tone.length; i++) tone[i] = 0.5 * Math.sin((2 * Math.PI * 3000 * i) / lowRate);
        const { energy } = run(tone, lowRate);
        const last = energy[energy.length - 1];
        // The topmost bands lie above Nyquist (4 kHz) here, so they are clamped to the last bins but still measured.
        expect(last.every((value) => Number.isFinite(value))).toBe(true);
        expect(Math.max(...last)).toBeGreaterThan(0);
        expect(run(silence(0.5), lowRate).energy.every((frame) => frame.every((value) => value === 0))).toBe(true);
    });
});

describe('BandOnsets events', () => {
    it('reports an isolated kick once, near the time of its onset', () => {
        const pcm = silence(1.5);
        addKick(pcm, 0.5);
        const { events } = run(pcm);
        expect(bandsOf(events)).toEqual([KICK]);
        expect(Math.abs(events[0].time - 0.5)).toBeLessThan(0.05);
    });

    it('stamps the onset frame and decides at most ONSET_LOOKAHEAD_FRAMES frames after it', () => {
        const pcm = silence(2);
        addKick(pcm, 0.5);
        addSnare(pcm, 1.0);
        addHat(pcm, 1.5);
        const { events, frameTimes } = run(pcm);
        expect(bandsOf(events).sort()).toEqual([KICK, SNARE, HIGHS].sort());
        const hop = frameTimes[1] - frameTimes[0];
        for (const event of events) {
            // The event carries the onset frame's own time, a frame time, and not the time it was decided.
            expect(frameTimes.some((time) => Math.abs(time - event.time) < 1e-9)).toBe(true);
            expect(event.decidedAt - event.time).toBeLessThanOrEqual(ONSET_LOOKAHEAD_FRAMES * hop + 1e-9);
            expect(event.decidedAt - event.time).toBeGreaterThanOrEqual(-1e-9);
        }
    });

    it('keeps strengths between 0 and 1, with the loudest hit at 1 and weaker ones below it', () => {
        const pcm = silence(3);
        addKick(pcm, 0.5, 1);
        addKick(pcm, 1.5, 0.3);
        addKick(pcm, 2.5, 0.5);
        const { events } = run(pcm);
        expect(events).toHaveLength(3);
        for (const event of events) {
            expect(event.strength).toBeGreaterThan(0);
            expect(event.strength).toBeLessThanOrEqual(1);
        }
        expect(events[0].strength).toBe(1);
        expect(events[1].strength).toBeLessThan(events[2].strength);
    });

    it('reports no duplicates and keeps events in time order', () => {
        const pcm = silence(4);
        for (let beat = 0; beat < 6; beat++) {
            addKick(pcm, 0.4 + beat * 0.5);
            addSnare(pcm, 0.65 + beat * 0.5);
            addHat(pcm, 0.4 + beat * 0.25);
        }
        const { events } = run(pcm);
        expect(events.length).toBeGreaterThan(12);
        for (let i = 1; i < events.length; i++) {
            expect(events[i].time).toBeGreaterThanOrEqual(events[i - 1].time);
            const same = events.filter((e) => e.band === events[i].band && Math.abs(e.time - events[i].time) < 0.03);
            expect(same).toHaveLength(1);
        }
    });

    it('does not take a snare for a kick: the snare range leaking into the low end is suppressed', () => {
        const pcm = silence(3);
        addKick(pcm, 0.5);
        addSnare(pcm, 1.5);
        addKick(pcm, 2.5);
        const { events } = run(pcm);
        expect(bandsOf(events)).toEqual([KICK, SNARE, KICK]);
    });

    it('calls a low note by its pitch: a thump is a kick, a 110 Hz note is bass', () => {
        const pcm = silence(3);
        addKick(pcm, 0.5);
        addBass(pcm, 1.5);
        addKick(pcm, 2.5);
        const { events } = run(pcm);
        expect(bandsOf(events)).toEqual([KICK, BASS, KICK]);
    });

    it('hears the kicks under a sustained pad chord and nothing in the chord itself', () => {
        const pcm = silence(5);
        addPad(pcm, 0.5, 4.5, 0.4);
        const kickTimes = [0.2, 2, 3, 4];
        for (const t of kickTimes) {
            addKick(pcm, t);
        }
        const low = run(pcm).events.filter((event) => event.band === KICK || event.band === BASS);
        // The chord's own ripple adds nothing: the low end holds the four kicks and no more.
        expect(low.map((event) => event.band)).toEqual([KICK, KICK, KICK, KICK]);
        low.forEach((event, i) => expect(event.time).toBeCloseTo(kickTimes[i], 1));
    });

    it('does not report the ripple of a hit as a second hit', () => {
        const pcm = silence(2);
        addKick(pcm, 0.5);
        // A weak note right behind the kick, inside the refractory span, is a ripple and not a new event.
        addBass(pcm, 0.5 + (BAND_ONSET_REFRACTORY_FRAMES[0] / 2) * 0.01, 0.1);
        const { events } = run(pcm);
        expect(bandsOf(events)).toEqual([KICK]);
    });

    it('forgets everything on reset', () => {
        const pcm = silence(1.5);
        addKick(pcm, 0.5);
        const extractor = new OnsetExtractor(TEST_SAMPLE_RATE);
        const onsets = new BandOnsets(TEST_SAMPLE_RATE, extractor.frameRate);
        const first = run(pcm, TEST_SAMPLE_RATE, onsets);
        expect(first.events).toHaveLength(1);
        onsets.reset();
        expect(Array.from(onsets.energy).every((value) => value === 0)).toBe(true);
        // The same audio again gives the same answer, as if the detector were new.
        const second = run(pcm, TEST_SAMPLE_RATE, onsets);
        expect(second.events.map(({ band, time }) => [band, time])).toEqual(
            first.events.map(({ band, time }) => [band, time]),
        );
    });

    it('does not let state from before a reset suppress or shape what follows', () => {
        // A loud hit, a reset, then a hit at a much earlier frame and far quieter: stale refractory state (lastFrame,
        // lastValue), a stale running mean or peak, or stale ring values would each hide or change it.
        const loud = silence(1.5);
        addKick(loud, 1.0);
        const quiet = silence(1.5);
        addKick(quiet, 0.1, 0.3);
        const fresh = run(quiet);
        expect(fresh.events).toHaveLength(1);
        const extractor = new OnsetExtractor(TEST_SAMPLE_RATE);
        const onsets = new BandOnsets(TEST_SAMPLE_RATE, extractor.frameRate);
        expect(run(loud, TEST_SAMPLE_RATE, onsets).events).toHaveLength(1);
        onsets.reset();
        const after = run(quiet, TEST_SAMPLE_RATE, onsets);
        // Identical band, time and strength: a stale peak would also lower the strength below 1.
        expect(after.events.map(({ band, time, strength }) => [band, time, strength])).toEqual(
            fresh.events.map(({ band, time, strength }) => [band, time, strength]),
        );
    });

    it('starts a new run from a clean slate after a reset, whatever the run before it did', () => {
        // The run before the reset is busy (a flickering floor that raises the running mean, loud hits that raise the
        // peak and set the refractory state at a late frame). The run after it is quiet, with a hit at an earlier
        // frame than the last event of the first run. Any stale state would hide or change that hit.
        const frameOf = (level: number): Float32Array => new Float32Array(FFT_SIZE / 2).fill(level);
        const feed = (onsets: BandOnsets, levels: number[]): Array<[number, number, number]> => {
            const events: Array<[number, number, number]> = [];
            levels.forEach((level, i) =>
                onsets.push(frameOf(level), i * 0.01, (band, time, strength) => events.push([band, time, strength])),
            );
            return events;
        };
        // Flicker only: its running mean alone (3 times 0.15) would hide a rise of 0.3, its peak would not.
        const flicker = Array.from({ length: 120 }, (_, i) => (i % 2 === 0 ? 0.3 : 0));
        // Loud hits: the peak and the refractory state at frame 100, the hit after the reset is at frame 3.
        const loud = Array.from({ length: 120 }, (_, i) => (i === 100 ? 4 : 0));
        const quietHit = (level: number): number[] => Array.from({ length: 60 }, (_, i) => (i === 3 ? level : 0));
        for (const [busy, level] of [
            [flicker, 0.3],
            [loud, 1],
        ] as const) {
            const quiet = quietHit(level);
            const fresh = feed(new BandOnsets(TEST_SAMPLE_RATE, 100), quiet);
            expect(fresh.length).toBeGreaterThan(0);
            const onsets = new BandOnsets(TEST_SAMPLE_RATE, 100);
            expect(feed(onsets, busy).length).toBeGreaterThan(0);
            onsets.reset();
            expect(feed(onsets, quiet)).toEqual(fresh);
        }
    });

    it('hears nothing in silence', () => {
        expect(run(silence(2)).events).toEqual([]);
    });

    it('ignores a non-finite level instead of going deaf', () => {
        const onsets = new BandOnsets(TEST_SAMPLE_RATE, 100);
        const events: Event[] = [];
        const sink = (band: number, time: number, strength: number): void => {
            events.push({ band, time, strength, decidedAt: 0 });
        };
        const frame = (level: number): Float32Array => new Float32Array(FFT_SIZE / 2).fill(level);
        let t = 0;
        const push = (level: number): void => onsets.push(frame(level), (t += 0.01), sink);
        for (let i = 0; i < 5; i++) push(0);
        push(Infinity);
        for (let i = 0; i < 20; i++) push(0);
        // A normal hit long after the bad frame.
        push(3);
        for (let i = 0; i < 20; i++) push(0);
        expect(events.length).toBeGreaterThan(0);
        for (const event of events) {
            expect(Number.isFinite(event.strength)).toBe(true);
            expect(event.strength).toBeGreaterThan(0);
        }
    });

    it('survives non-finite low-end levels around an onset with valid events', () => {
        const onsets = new BandOnsets(TEST_SAMPLE_RATE, 100);
        const events: Event[] = [];
        const sink = (band: number, time: number, strength: number): void => {
            events.push({ band, time, strength, decidedAt: 0 });
        };
        const frame = (level: number, lowLevel = level): Float32Array => {
            const bins = new Float32Array(FFT_SIZE / 2).fill(level);
            bins.fill(lowLevel, 1, 12);
            return bins;
        };
        let t = 0;
        expect(() => {
            for (let i = 0; i < 5; i++) onsets.push(frame(0), (t += 0.01), sink);
            onsets.push(frame(0, -Infinity), (t += 0.01), sink);
            onsets.push(frame(3, NaN), (t += 0.01), sink);
            onsets.push(frame(3, Infinity), (t += 0.01), sink);
            for (let i = 0; i < 20; i++) onsets.push(frame(0), (t += 0.01), sink);
            onsets.push(frame(3), (t += 0.01), sink);
            for (let i = 0; i < 20; i++) onsets.push(frame(0), (t += 0.01), sink);
        }).not.toThrow();
        expect(events.length).toBeGreaterThan(0);
        for (const event of events) {
            expect(Number.isFinite(event.time)).toBe(true);
            expect(Number.isFinite(event.strength)).toBe(true);
            expect([KICK, BASS, SNARE, HIGHS]).toContain(event.band);
        }
    });

    it.each([8000, 44100, 48000, 96000])('builds sensible bands at %i Hz', (sampleRate) => {
        const extractor = new OnsetExtractor(sampleRate);
        const onsets = new BandOnsets(sampleRate, extractor.frameRate);
        const pcm = new Float32Array(sampleRate);
        for (let i = Math.round(0.5 * sampleRate); i < pcm.length; i++) {
            pcm[i] = 0.5 * Math.sin((2 * Math.PI * 80 * i) / sampleRate) * Math.exp(-(i / sampleRate - 0.5) / 0.1);
        }
        let frames = 0;
        expect(() => {
            for (let offset = 0; offset < pcm.length; offset += 128) {
                extractor.push(pcm.subarray(offset, Math.min(pcm.length, offset + 128)), (frame) => {
                    onsets.push(frame.logMagnitude, frames++ / extractor.frameRate, () => {});
                    for (let b = 0; b < HUB_BAND_COUNT; b++) {
                        expect(Number.isFinite(onsets.energy[b])).toBe(true);
                    }
                });
            }
        }).not.toThrow();
        expect(frames).toBeGreaterThan(10);
    });
});

describe('ringSizeFor', () => {
    it('keeps 8 slots for the default tuning', () => {
        expect(ringSizeFor(LOW_ONSET_LAG_FRAMES, BAND_ONSET_PAST_FRAMES, ONSET_LOOKAHEAD_FRAMES)).toBe(8);
    });

    it('grows to the next power of two that holds the deepest reach back, the look-ahead and the newest frame', () => {
        expect(ringSizeFor(1, 1, 1)).toBe(8);
        expect(ringSizeFor(3, 4, 3)).toBe(8);
        expect(ringSizeFor(6, 2, 2)).toBe(16);
        expect(ringSizeFor(2, 9, 2)).toBe(16);
        expect(ringSizeFor(2, 2, 12)).toBe(16);
        expect(ringSizeFor(10, 10, 10)).toBe(32);
        expect(ringSizeFor(0, 0, 0)).toBe(8);
    });
});
