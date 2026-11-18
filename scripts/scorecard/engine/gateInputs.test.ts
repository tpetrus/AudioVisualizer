import { describe, expect, it } from 'vitest';
import { TEST_SAMPLE_RATE, renderTrack } from '../../../app/features/rhythm/testSignals';
import {
    GATE_INPUTS,
    RANDOM_BASS_BPM,
    RANDOM_BASS_SAMPLE_RATE,
    countFalseOpens,
    createRandom,
    earlierOpening,
    firstOpenings,
    onBeatBassPcm,
    opensOnLockedClock,
    randomBassPcm,
    secondsAfterLock,
} from './gateInputs';
import { GateBassFeature } from '../../../app/features/rhythm/gateBass';
import { PrehubBass } from './prehubBass';
import { replayPcm, type ReplayResult } from './replay';

// A replay result with only the fields the gate-input helpers read.
function replayWith(fields: {
    seconds?: number;
    lock: number | null;
    gateBass: number | null;
    hubLowEnd: number | null;
    frameTimed: number | null;
    prehub: number | null;
}): ReplayResult {
    const gate = (firstOpenSeconds: number | null) => ({ firstOpenSeconds, openShare: 0 });
    return {
        seconds: fields.seconds ?? 30,
        dancerLockSeconds: fields.lock,
        gate: gate(fields.gateBass),
        prehubGate: gate(fields.prehub),
        gateInputs: { frameTimed: gate(fields.frameTimed), hubLowEnd: gate(fields.hubLowEnd) },
    } as ReplayResult;
}

describe('randomBassPcm', () => {
    it('gives the same samples for the same seed and other samples for another', () => {
        const first = randomBassPcm(7, 8);
        expect(randomBassPcm(7, 8)).toEqual(first);
        expect(randomBassPcm(8, 8)).not.toEqual(first);
    });

    it('lasts the beats at 120 bpm plus a short tail, and has sound in every beat', () => {
        const pcm = randomBassPcm(1, 8);
        const beatSamples = (60 / RANDOM_BASS_BPM) * RANDOM_BASS_SAMPLE_RATE;
        expect(pcm.length).toBe(Math.ceil((8 * 0.5 + 0.5) * RANDOM_BASS_SAMPLE_RATE));
        for (let beat = 0; beat < 8; beat++) {
            const slice = pcm.subarray(beat * beatSamples, (beat + 1) * beatSamples);
            expect(Math.max(...slice.map(Math.abs))).toBeGreaterThan(0.05);
        }
    });

    it('uses the gate specs generator, which wraps in 32 bits', () => {
        const random = createRandom(1);
        // (1664525 * 1 + 1013904223) mod 2^32, then that state's successor.
        expect(random()).toBeCloseTo(1015568748 / 4294967296, 12);
        expect(random()).toBeCloseTo(((Math.imul(1015568748, 1664525) + 1013904223) >>> 0) / 4294967296, 12);
    });
});

describe('earlierOpening', () => {
    it('is open as soon as either gate is', () => {
        expect(earlierOpening(5, 7)).toBe(5);
        expect(earlierOpening(7, 5)).toBe(5);
        expect(earlierOpening(null, 4)).toBe(4);
        expect(earlierOpening(4, null)).toBe(4);
        expect(earlierOpening(null, null)).toBeNull();
    });
});

describe('firstOpenings and secondsAfterLock', () => {
    it('take two gates from the hub low end and gate bass gates only', () => {
        const replay = replayWith({ lock: 3, gateBass: 7, hubLowEnd: 9, frameTimed: 6, prehub: 4 });
        expect(firstOpenings(replay)).toEqual({ gateBass: 7, hubLowEnd: 9, frameTimed: 6, prehub: 4, twoGates: 7 });
        expect(secondsAfterLock(replay)).toEqual({ gateBass: 4, hubLowEnd: 6, frameTimed: 3, prehub: 1, twoGates: 4 });
    });

    it('count the rest of the track for a gate that never opens', () => {
        const replay = replayWith({
            seconds: 20,
            lock: 5,
            gateBass: null,
            hubLowEnd: null,
            frameTimed: null,
            prehub: 8,
        });
        expect(secondsAfterLock(replay)).toEqual({
            gateBass: 15,
            hubLowEnd: 15,
            frameTimed: 15,
            prehub: 3,
            twoGates: 15,
        });
    });

    it('have nothing to say when the dancer never locks', () => {
        const never = { gateBass: null, hubLowEnd: null, frameTimed: null, prehub: null };
        expect(secondsAfterLock(replayWith({ lock: null, ...never }))).toBeUndefined();
    });
});

describe('the frame-timed gate input', () => {
    const click = renderTrack({ seconds: 20, bpm: 120, beatsPerBar: 4 }).pcm;

    it('opens on a steady kick, no earlier than the lock', () => {
        const replay = replayPcm(click, TEST_SAMPLE_RATE);
        const open = replay.gateInputs.frameTimed.firstOpenSeconds;
        expect(open).not.toBeNull();
        expect(open!).toBeGreaterThanOrEqual(replay.dancerLockSeconds!);
    });

    // The frame-timed reader shares the pre-hub reader's filtered audio and differs only in where its window ends.
    it('reads BassPulse at a given end sample exactly as at the matching render time', () => {
        const atTime = new PrehubBass(TEST_SAMPLE_RATE);
        atTime.prepare(click);
        const atSample = new PrehubBass(TEST_SAMPLE_RATE);
        atSample.shareFiltered(atTime);
        for (let tick = 0; tick < 600; tick++) {
            const time = tick / 60;
            expect(atSample.updateAtSample(Math.floor(time * TEST_SAMPLE_RATE))).toBe(atTime.update(time));
        }
    });

    // The worklet's feature (contract C1) is the same number BassPulse computed from its analyser, so the hub's gate
    // input is the pre-hub one at frame times and nothing else.
    it('matches the worklet gate bass to BassPulse at every frame end', () => {
        const pulse = new PrehubBass(TEST_SAMPLE_RATE);
        pulse.prepare(click);
        const feature = new GateBassFeature(TEST_SAMPLE_RATE);
        // Pushed block by block and read at the end of each, as the worklet reads it at the end of each frame.
        for (let end = 4321; end <= click.length; end += 4321) {
            feature.push(click.subarray(end - 4321, end));
            pulse.updateAtSample(end);
            // Within 5e-6: the offline biquads keep their feedback in double and round only their output, the worklet's
            // feed back the float32 output a node would; a browser's own filters differ from both by as little.
            expect(feature.levelAt(end)).toBeCloseTo(pulse.energy, 5);
        }
        expect(pulse.energy).toBeGreaterThanOrEqual(0);
    });

    it('reads silence before the first frame is delivered', () => {
        const bass = new PrehubBass(TEST_SAMPLE_RATE);
        bass.prepare(click);
        expect(bass.updateAtSample(-1)).toBe(0);
    });
});

describe('the locked clock', () => {
    it('opens every input on the same notes placed on the beat', () => {
        const opens = opensOnLockedClock(onBeatBassPcm(40));
        for (const input of GATE_INPUTS) expect(opens[input]).toBe(true);
    });

    it('locks from the start and skips the tracker', () => {
        const replay = replayPcm(onBeatBassPcm(16), RANDOM_BASS_SAMPLE_RATE, { lockedTempo: RANDOM_BASS_BPM });
        expect(replay.dancerLockSeconds).toBe(0);
        expect(replay.tempo).toEqual([]);
        expect(replay.beats).toEqual([]);
    });

    it('counts how many random patterns open each input, two gates at least as often as either of its gates', () => {
        const counts = countFalseOpens(3, 40);
        for (const input of GATE_INPUTS) expect(counts[input]).toBeGreaterThanOrEqual(0);
        expect(counts.twoGates).toBeGreaterThanOrEqual(Math.max(counts.hubLowEnd, counts.gateBass));
        expect(counts.twoGates).toBeLessThanOrEqual(counts.hubLowEnd + counts.gateBass);
    });
});
