import { describe, expect, it } from 'vitest';
import { BandOnsets, ringSizeFor, type BandOnsetsFrame } from './bandOnsets';
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

// A frame of hand-made levels with no complex spectrum: the phase detector skips bins without a magnitude, so only the
// level detectors see it.
const NO_SPECTRUM = new Float32Array(FFT_SIZE);
const levelsOnly = (logMagnitude: Float32Array): BandOnsetsFrame => ({
    logMagnitude,
    real: NO_SPECTRUM,
    imag: NO_SPECTRUM,
});

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
            onsets.push(frame, now, sink);
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
        const frameOf = (level: number): BandOnsetsFrame => levelsOnly(new Float32Array(FFT_SIZE / 2).fill(level));
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
        const frame = (level: number): BandOnsetsFrame => levelsOnly(new Float32Array(FFT_SIZE / 2).fill(level));
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
        const frame = (level: number, lowLevel = level): BandOnsetsFrame => {
            const bins = new Float32Array(FFT_SIZE / 2).fill(level);
            bins.fill(lowLevel, 1, 12);
            return levelsOnly(bins);
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
                    onsets.push(frame, frames++ / extractor.frameRate, () => {});
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

describe('BandOnsets low-end phase', () => {
    // Bass notes on one pitch, each struck as the one before it starts its release: the level hardly moves, the phase
    // restarts. The first note follows silence and is the level detector's; the others only the phase can find.
    const restruck = [0.5, 0.74, 0.98, 1.22];
    function restruckNotes(): Float32Array {
        const pcm = silence(2);
        for (const t of restruck) {
            addBass(pcm, t);
        }
        return pcm;
    }

    it('hears a bass note struck again on the pitch still sounding', () => {
        const low = run(restruckNotes()).events.filter((event) => event.band === KICK || event.band === BASS);
        expect(bandsOf(low)).toEqual([BASS, BASS, BASS, BASS]);
        low.forEach((event, i) => expect(Math.abs(event.time - restruck[i])).toBeLessThan(0.03));
        for (const event of low) {
            expect(event.strength).toBeGreaterThan(0);
            expect(event.strength).toBeLessThanOrEqual(1);
        }
    });

    it('hears a held note once, not again while it sounds', () => {
        const pcm = silence(3);
        addHit(pcm, 0.5, 2, (t) => 0.35 * Math.min(1, t / 0.005, (2 - t) / 0.06) * Math.sin(2 * Math.PI * 110 * t));
        expect(bandsOf(run(pcm).events)).toEqual([BASS]);
    });

    it('does not take the phase a kick turns in a sounding note for a new note', () => {
        // A kick struck over a bass note keeps moving the note's phase while its own pitch falls. Which of kick and bass
        // the level detector calls the hit is the classifier's business; the phase must add no third event after it.
        const pcm = silence(2);
        addBass(pcm, 0.5);
        addKick(pcm, 0.62);
        const { events } = run(pcm);
        expect(events.map((event) => event.time)).toEqual([expect.closeTo(0.5, 1), expect.closeTo(0.62, 1)]);
    });

    it('counts its phase onsets, and a reset does not clear the count', () => {
        const extractor = new OnsetExtractor(TEST_SAMPLE_RATE);
        const onsets = new BandOnsets(TEST_SAMPLE_RATE, extractor.frameRate);
        expect(onsets.phaseOnsetCount).toBe(0);
        const first = run(restruckNotes(), TEST_SAMPLE_RATE, onsets);
        const counted = onsets.phaseOnsetCount;
        // The first note is the level detector's; every event after it here is a phase onset.
        expect(counted).toBe(first.events.length - 1);
        expect(counted).toBeGreaterThan(0);
        onsets.reset();
        expect(onsets.phaseOnsetCount).toBe(counted);
    });

    it('forgets the phase history on reset', () => {
        const extractor = new OnsetExtractor(TEST_SAMPLE_RATE);
        const onsets = new BandOnsets(TEST_SAMPLE_RATE, extractor.frameRate);
        const first = run(restruckNotes(), TEST_SAMPLE_RATE, onsets);
        onsets.reset();
        expect(run(restruckNotes(), TEST_SAMPLE_RATE, onsets).events).toEqual(first.events);
    });

    // Hand-made frames: a tone over the low bins at one level whose phase turns by a fixed angle per frame plus an
    // optional jump. Level and complex spectrum are built together so the phase detector sees a real tone.
    function toneFrames(): (level: number, jump?: number, turn?: number, at?: number) => BandOnsetsFrame {
        let phase = 0;
        return (level, jump = 0, turn = 0.7, at) => {
            phase = at ?? phase + turn + jump;
            const logMagnitude = new Float32Array(FFT_SIZE / 2);
            const real = new Float32Array(FFT_SIZE);
            const imag = new Float32Array(FFT_SIZE);
            for (let k = 1; k < 12; k++) {
                logMagnitude[k] = level;
                real[k] = level * Math.cos(phase);
                imag[k] = level * Math.sin(phase);
            }
            return { logMagnitude, real, imag };
        };
    }

    // Steady tone from frame 0 with one phase jump at `jumpAt`, pushed into `onsets`; returns the events.
    function steadyThenJump(onsets: BandOnsets, jumpAt: number): { band: number; time: number; strength: number }[] {
        const events: { band: number; time: number; strength: number }[] = [];
        const sink = (band: number, time: number, strength: number): void => {
            events.push({ band, time, strength });
        };
        const tone = toneFrames();
        for (let i = 0; i < jumpAt + 30; i++) {
            // The first frame starts at 0.3 rad, not at one turn step, because a stale real-only history would otherwise
            // predict that very phase by coincidence. The first frames are loud so that a stale spectrum history would give them a large weighted deviation
            // (weight is the level), which a fresh start has none of.
            onsets.push(
                tone(i < 3 ? 4 : 1, i === jumpAt ? Math.PI : 0, 0.7, i === 0 ? 0.3 : undefined),
                (i + 1) * 0.01,
                sink,
            );
        }
        return events;
    }

    it('starts a new run exactly like a fresh instance after reset', () => {
        // The busy run ends mid-jump with a loud tone, so a stale peak, mean or spectrum history would change the
        // threshold, the strength or the events of the steady run that follows.
        const used = new BandOnsets(TEST_SAMPLE_RATE, 100);
        const busy = toneFrames();
        for (let i = 0; i < 80; i++) {
            used.push(busy(i % 3 === 0 ? 5 : 2, i % 2 === 0 ? 2.5 : 0, 0.3 + (i % 5) * 0.4), (i + 1) * 0.01, () => {});
        }
        // Park the last frame at 45 degrees so that its real and imaginary parts are both well away from zero.
        used.push(busy(2, 0, 0, Math.PI / 4), 0.81, () => {});
        used.reset();
        const expected = steadyThenJump(new BandOnsets(TEST_SAMPLE_RATE, 100), 12);
        expect(expected).toHaveLength(1);
        expect(steadyThenJump(used, 12)).toEqual(expected);
    });

    it('still finds a re-struck note after non-finite complex frames', () => {
        // The non-finite frames must leave no NaN or Infinity in the phase peak or mean; a poisoned peak would raise
        // the floor to infinity and the detector would never fire again.
        const onsets = new BandOnsets(TEST_SAMPLE_RATE, 100);
        const events: { band: number; strength: number }[] = [];
        const sink = (band: number, _time: number, strength: number): void => {
            events.push({ band, strength });
        };
        const tone = toneFrames();
        let t = 0;
        const poisoned = (value: number): BandOnsetsFrame => ({
            logMagnitude: new Float32Array(FFT_SIZE / 2).fill(1),
            real: new Float32Array(FFT_SIZE).fill(value),
            imag: new Float32Array(FFT_SIZE).fill(value),
        });
        for (let i = 0; i < 10; i++) onsets.push(tone(1), (t += 0.01), sink);
        for (const value of [Infinity, NaN, -Infinity]) onsets.push(poisoned(value), (t += 0.01), sink);
        // Non-finite levels as well, as a broken analyser would give.
        // A few clean frames first so the spectrum history is finite again, then non-finite levels twice in a row,
        // because a weight is the smaller of this and the previous frame's level.
        for (let i = 0; i < 3; i++) onsets.push(tone(1), (t += 0.01), sink);
        for (let i = 0; i < 2; i++) {
            const infiniteLevels = tone(1);
            (infiniteLevels.logMagnitude as Float32Array).fill(Infinity);
            onsets.push(infiniteLevels, (t += 0.01), sink);
        }
        for (let i = 0; i < 20; i++) onsets.push(tone(1), (t += 0.01), sink);
        events.length = 0;
        onsets.push(tone(1, Math.PI), (t += 0.01), sink);
        for (let i = 0; i < 30; i++) onsets.push(tone(1), (t += 0.01), sink);
        expect(events).toHaveLength(1);
        expect(events[0].band).toBe(BASS);
        expect(Number.isFinite(events[0].strength)).toBe(true);
    });

    it('sizes the ring with the phase detector quiet span folded into the first argument', () => {
        // BandOnsets passes max(LOW_ONSET_LAG_FRAMES, LOW_PHASE_QUIET_FRAMES) as the first argument because the quiet
        // check reaches back that many frames. A reach of 6 with a 2-frame window and look-ahead needs 6 + 2 + 1 = 9
        // slots, so 16; had the quiet span been left out (a reach of 2), the ring would stay at 8 and the check would
        // read slots already overwritten. The real expression runs at module load from the default constants, so this
        // pins the function's contract for it rather than the call site.
        expect(ringSizeFor(6, 2, 2)).toBe(16);
        expect(ringSizeFor(2, 2, 2)).toBe(8);
    });

    it('counts a phase jump just before a level onset as that onset, not as a second event', () => {
        // A steady tone in the low bins (level 1, phase turning by a fixed angle per frame), its phase jumping by half a
        // turn one frame before its level steps up: one hit that both detectors see, so one event.
        const onsets = new BandOnsets(TEST_SAMPLE_RATE, 100);
        const events: number[] = [];
        let phase = 0;
        const tone = (level: number, jump = 0): BandOnsetsFrame => {
            phase += 0.7 + jump;
            const logMagnitude = new Float32Array(FFT_SIZE / 2);
            const real = new Float32Array(FFT_SIZE);
            const imag = new Float32Array(FFT_SIZE);
            for (let k = 1; k < 12; k++) {
                logMagnitude[k] = level;
                real[k] = level * Math.cos(phase);
                imag[k] = level * Math.sin(phase);
            }
            return { logMagnitude, real, imag };
        };
        let t = 0;
        for (let i = 0; i < 60; i++) onsets.push(tone(1), (t += 0.01), (band) => events.push(band));
        events.length = 0;
        onsets.push(tone(1, Math.PI), (t += 0.01), (band) => events.push(band));
        for (let i = 0; i < 30; i++) onsets.push(tone(3), (t += 0.01), (band) => events.push(band));
        expect(events).toHaveLength(1);
    });

    it.each([
        ['a kick when the kick range rises with it', 2, KICK],
        ['a bass note when only the phase moved', 1, BASS],
    ])('calls a phase onset %s', (_, kickRangeLevel, band) => {
        // A steady tone over the whole low end after a loud hit that keeps the level detector's floor up, then a phase
        // jump with the kick range (the low end's bins below the bass band) stepping up or not. Under that floor the
        // level detector stays quiet either way, so the event is the phase detector's: a kick masked by the note it
        // was struck over, or the note struck again.
        const onsets = new BandOnsets(TEST_SAMPLE_RATE, 100);
        const events: number[] = [];
        let phase = 0;
        const tone = (level: number, kickRange = level, jump = 0): BandOnsetsFrame => {
            phase += 0.7 + jump;
            const logMagnitude = new Float32Array(FFT_SIZE / 2);
            const real = new Float32Array(FFT_SIZE);
            const imag = new Float32Array(FFT_SIZE);
            for (let k = 1; k < 12; k++) {
                logMagnitude[k] = k < 3 ? kickRange : level;
                real[k] = Math.cos(phase);
                imag[k] = Math.sin(phase);
            }
            return { logMagnitude, real, imag };
        };
        let t = 0;
        const sink = (eventBand: number): number => events.push(eventBand);
        for (let i = 0; i < 30; i++) onsets.push(tone(1), (t += 0.01), sink);
        for (let i = 0; i < 3; i++) onsets.push(tone(7), (t += 0.01), sink);
        for (let i = 0; i < 40; i++) onsets.push(tone(1), (t += 0.01), sink);
        events.length = 0;
        onsets.push(tone(1, kickRangeLevel, Math.PI), (t += 0.01), sink);
        for (let i = 0; i < 30; i++) onsets.push(tone(1, kickRangeLevel), (t += 0.01), sink);
        expect(events).toEqual([band]);
    });

    it('ignores a non-finite complex spectrum instead of going deaf', () => {
        const onsets = new BandOnsets(TEST_SAMPLE_RATE, 100);
        const events: Event[] = [];
        const sink = (band: number, time: number, strength: number): void => {
            events.push({ band, time, strength, decidedAt: 0 });
        };
        const levels = new Float32Array(FFT_SIZE / 2).fill(1);
        const spectrum = (value: number): BandOnsetsFrame => ({
            logMagnitude: levels,
            real: new Float32Array(FFT_SIZE).fill(value),
            imag: new Float32Array(FFT_SIZE).fill(value),
        });
        let t = 0;
        expect(() => {
            for (const value of [1, 1, Infinity, NaN, 1, -Infinity, 1, 1])
                onsets.push(spectrum(value), (t += 0.01), sink);
            for (let i = 0; i < 20; i++) onsets.push(levelsOnly(new Float32Array(FFT_SIZE / 2)), (t += 0.01), sink);
            onsets.push(levelsOnly(new Float32Array(FFT_SIZE / 2).fill(3)), (t += 0.01), sink);
            for (let i = 0; i < 20; i++) onsets.push(levelsOnly(new Float32Array(FFT_SIZE / 2)), (t += 0.01), sink);
        }).not.toThrow();
        expect(events.length).toBeGreaterThan(0);
        for (const event of events) {
            expect(Number.isFinite(event.strength)).toBe(true);
        }
    });
});
