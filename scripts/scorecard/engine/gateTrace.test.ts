import { describe, expect, it } from 'vitest';
import { createBassGateState, stepBassGate } from '../../../app/features/rhythm/bassGate';
import { liveFireHitsBeat } from '../targets';
import { GateTrace, bumpTimes, bumpsOnBeat, firstOpenSeconds } from './gateTrace';
import { RANDOM_BASS_BPM, RANDOM_BASS_SAMPLE_RATE, onBeatBassPcm } from './gateInputs';
import { replayPcm } from './replay';

const shipped = { createBassGateState, stepBassGate };

describe('GateTrace', () => {
    it('stores what it is given, with NaN for an undefined phase, and grows past its capacity', () => {
        const trace = new GateTrace(2);
        for (let i = 0; i < 5; i++) trace.tick(i / 10, i === 1 ? undefined : i / 4, i, 7, i % 2 === 0, 120 + i);
        expect(trace.length).toBe(5);
        expect(trace.bass[3]).toBe(0.3);
        expect(Number.isNaN(trace.beatPhase[1])).toBe(true);
        expect(trace.beatPhase[2]).toBe(0.5);
        expect([trace.beatCount[4], trace.songChangeCount[4], trace.tempoLocked[4], trace.tempoLocked[3]]).toEqual([
            4, 7, 1, 0,
        ]);
        expect(trace.bpm[4]).toBe(124);
    });
});

describe('bumpsOnBeat', () => {
    const beats = [1, 1.5, 2, 2.5];

    it('counts the bumps inside the live hit window and the median distance to the nearest beat', () => {
        // 30 ms late and 10 ms early hit; 150 ms early and 60 ms late do not.
        expect(bumpsOnBeat([1.03, 1.49, 1.85, 2.56], beats, liveFireHitsBeat)).toEqual({
            share: 0.5,
            medianMs: expect.closeTo(30, 6),
        });
    });

    it('is null without bumps or beats', () => {
        expect(bumpsOnBeat([], beats, liveFireHitsBeat)).toBeNull();
        expect(bumpsOnBeat([1], [], liveFireHitsBeat)).toBeNull();
    });
});

describe('firstOpenSeconds', () => {
    const pcm = onBeatBassPcm(40);

    it.each([
        ['the tracker and the dancer lock', undefined],
        ['a locked clock', RANDOM_BASS_BPM],
    ])("steps the shipped gate over a trace to the replay's own first opening with %s", (_name, lockedTempo) => {
        const trace = new GateTrace();
        const replay = replayPcm(pcm, RANDOM_BASS_SAMPLE_RATE, { lockedTempo, gateTrace: trace });
        expect(replay.gate.firstOpenSeconds).not.toBeNull();
        expect(firstOpenSeconds(trace, shipped)).toBe(replay.gate.firstOpenSeconds);
    });

    it('opens no earlier than a hidden lock, and the same as an unhidden trace when the lock comes first', () => {
        const trace = new GateTrace();
        replayPcm(pcm, RANDOM_BASS_SAMPLE_RATE, { lockedTempo: RANDOM_BASS_BPM, gateTrace: trace });
        const opening = firstOpenSeconds(trace, shipped)!;
        expect(firstOpenSeconds(trace, shipped, 0)).toBe(opening);
        // Hidden past the natural opening, so the gate can only open once the clock shows.
        const lockAt = opening + 1;
        const hidden = firstOpenSeconds(trace, shipped, lockAt)!;
        expect(hidden).toBeGreaterThanOrEqual(lockAt);
    });

    it('finds the bumps of an open gate on the beat clock, one per beat on on-beat kicks', () => {
        const trace = new GateTrace();
        replayPcm(pcm, RANDOM_BASS_SAMPLE_RATE, { lockedTempo: RANDOM_BASS_BPM, gateTrace: trace });
        const bumps = bumpTimes(trace, shipped);
        expect(bumps[0]).toBeGreaterThanOrEqual(firstOpenSeconds(trace, shipped)!);
        const beat = 60 / RANDOM_BASS_BPM;
        for (let i = 1; i < bumps.length; i++) expect(bumps[i] - bumps[i - 1]).toBeCloseTo(beat, 1);
    });

    it('is null for a gate that never opens', () => {
        const trace = new GateTrace();
        trace.tick(0, 0.5, 0, 0, true, 120);
        trace.tick(0, 0.6, 0, 0, true, 120);
        expect(firstOpenSeconds(trace, shipped)).toBeNull();
    });
});
