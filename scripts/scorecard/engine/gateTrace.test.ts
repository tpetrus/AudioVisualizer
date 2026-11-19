import { describe, expect, it } from 'vitest';
import { createBassGateState, stepBassGate } from '../../../app/features/rhythm/bassGate';
import { GateTrace, firstOpenSeconds } from './gateTrace';
import { RANDOM_BASS_BPM, RANDOM_BASS_SAMPLE_RATE, onBeatBassPcm } from './gateInputs';
import { replayPcm } from './replay';

const shipped = { createBassGateState, stepBassGate };

describe('GateTrace', () => {
    it('stores what it is given, with NaN for an undefined phase, and grows past its capacity', () => {
        const trace = new GateTrace(2);
        for (let i = 0; i < 5; i++) trace.tick(i / 10, i === 1 ? undefined : i / 4, i, 7, i % 2 === 0);
        expect(trace.length).toBe(5);
        expect(trace.bass[3]).toBe(0.3);
        expect(Number.isNaN(trace.beatPhase[1])).toBe(true);
        expect(trace.beatPhase[2]).toBe(0.5);
        expect([trace.beatCount[4], trace.songChangeCount[4], trace.tempoLocked[4], trace.tempoLocked[3]]).toEqual([
            4, 7, 1, 0,
        ]);
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

    it('is null for a gate that never opens', () => {
        const trace = new GateTrace();
        trace.tick(0, 0.5, 0, 0, true);
        trace.tick(0, 0.6, 0, 0, true);
        expect(firstOpenSeconds(trace, shipped)).toBeNull();
    });
});
