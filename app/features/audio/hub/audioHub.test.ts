import { beforeEach, describe, expect, it, vi } from 'vitest';
import { HUB_BANDS, HUB_BAND_COUNT, METER_VISUAL_CONFIDENCE } from '~/features/rhythm/rhythmConfig';
import type { RhythmTracker } from '~/features/rhythm/rhythmTracker';
import {
    createRhythmState,
    FEATURE_MESSAGE_VERSION,
    type FeatureBatch,
    type FeatureListener,
} from '~/features/rhythm/types';
import { AudioHub } from './audioHub';
import { GATE_BASS_CUTOFF_HZ, GATE_BASS_WINDOW } from './gateBassTap';
import { HUB_FRAME_CAPACITY, HUB_MIN_PEAK, HUB_PEAK_HALF_LIFE_SECONDS, HUB_PENDING_ONSET_CAPACITY } from './hubConfig';

// Just the parts of RhythmTracker the hub touches.
class StubTracker {
    readonly state = createRhythmState();
    now: number | undefined = 10;
    listeners = new Set<FeatureListener>();
    readonly updatePhase = vi.fn((_now?: number) => {});
    readonly addFeatureListener = vi.fn((listener: FeatureListener) => {
        this.listeners.add(listener);
        return () => {
            this.listeners.delete(listener);
        };
    });
    source: AnalyserNode | undefined;
    renderTimeNow(): number | undefined {
        return this.now;
    }
    getSource(): AnalyserNode | undefined {
        return this.source;
    }
    asTracker(): RhythmTracker {
        return this as unknown as RhythmTracker;
    }
}

interface FrameSpec {
    time: number;
    energy: number | number[];
}
// A source whose context builds stub nodes: each analyser reports `level` in every sample of its window, so a tap
// reads `level` as its RMS. `nodes` records what was built and `disconnected` what was disconnected.
function stubSource(initialLevel: number) {
    // Mutable so a spec can change what the tap reads between updates.
    let level = initialLevel;
    const nodes: Record<string, unknown>[] = [];
    const disconnected: unknown[] = [];
    const node = (fields: Record<string, unknown>) => {
        const built: Record<string, unknown> = {
            ...fields,
            connect: vi.fn(),
            disconnect: vi.fn(() => disconnected.push(built)),
        };
        nodes.push(built);
        return built;
    };
    const context = {
        createBiquadFilter: () => node({ type: 'allpass', frequency: { value: 350 }, Q: { value: 1 } }),
        createAnalyser: () =>
            node({ fftSize: 2048, getFloatTimeDomainData: (target: Float32Array) => target.fill(level) }),
    };
    const source = node({ context }) as unknown as AnalyserNode;
    const setLevel = (next: number) => {
        level = next;
    };
    return { source, nodes, disconnected, setLevel };
}

interface OnsetSpec {
    band: number;
    time: number;
    strength?: number;
}

function batch(frames: FrameSpec[], onsets: OnsetSpec[] = []): FeatureBatch {
    const frameTimes = new Float64Array(frames.length);
    const bandEnergy = new Float32Array(frames.length * HUB_BAND_COUNT);
    frames.forEach((frame, i) => {
        frameTimes[i] = frame.time;
        for (let b = 0; b < HUB_BAND_COUNT; b++) {
            bandEnergy[i * HUB_BAND_COUNT + b] = Array.isArray(frame.energy) ? frame.energy[b] : frame.energy;
        }
    });
    return {
        version: FEATURE_MESSAGE_VERSION,
        time0: frames[0]?.time ?? 0,
        count: frames.length,
        frames: new Float32Array(0),
        frameTimes,
        bandEnergy,
        onsetCount: onsets.length,
        onsetBand: Uint8Array.from(onsets.map((o) => o.band)),
        onsetTime: Float64Array.from(onsets.map((o) => o.time)),
        onsetStrength: Float32Array.from(onsets.map((o) => o.strength ?? 1)),
    };
}

describe('AudioHub', () => {
    let tracker: StubTracker;
    let hub: AudioHub;

    beforeEach(() => {
        tracker = new StubTracker();
        hub = new AudioHub();
        hub.start(tracker.asTracker());
    });

    function feed(frames: FrameSpec[], onsets: OnsetSpec[] = []) {
        hub.onBatch(batch(frames, onsets));
    }

    describe('start and dispose', () => {
        it('is idempotent for the same tracker and restarts for another', () => {
            hub.start(tracker.asTracker());
            expect(tracker.addFeatureListener).toHaveBeenCalledTimes(1);
            expect(tracker.listeners.size).toBe(1);

            const other = new StubTracker();
            hub.start(other.asTracker());
            expect(tracker.listeners.size).toBe(0);
            expect(other.listeners.size).toBe(1);
        });

        it('removes its listener on dispose and keeps the snapshot readable', () => {
            feed([{ time: 1, energy: 100 }]);
            hub.update(1);
            hub.dispose();
            expect(tracker.listeners.size).toBe(0);
            expect(hub.snapshot.bands[0]).toBe(1);
            // Safe to call twice and to update afterwards.
            hub.dispose();
            hub.update(2);
            expect(hub.snapshot.time).toBe(2);
        });

        it('registers the hub as the listener', () => {
            expect([...tracker.listeners][0]).toBe(hub);
        });
    });

    describe('held frames', () => {
        it('reads the newest frame at or before the snapshot time', () => {
            feed([
                { time: 1.0, energy: 0.8 },
                { time: 1.1, energy: 0.4 },
                { time: 1.2, energy: 0.2 },
            ]);
            hub.update(1.15);
            expect(hub.snapshot.bands[0]).toBeCloseTo(0.5, 1);
            hub.update(1.2);
            expect(hub.snapshot.bands[0]).toBeCloseTo(0.25, 1);
            hub.update(9);
            expect(hub.snapshot.bands[0]).toBeCloseTo(0.25, 1);
        });

        it('picks different frames for different times', () => {
            feed([
                { time: 1.0, energy: [0.8, 0, 0, 0, 0, 0] },
                { time: 1.1, energy: [0.4, 0, 0, 0, 0, 0] },
            ]);
            hub.update(1.05);
            const early = hub.snapshot.bands[0];
            hub.update(1.1);
            expect(early).toBeCloseTo(1, 5);
            expect(hub.snapshot.bands[0]).toBeCloseTo(0.5, 1);
        });

        it('falls back to the oldest held frame when the time precedes all of them', () => {
            feed([
                { time: 1.0, energy: [0.8, 0, 0, 0, 0, 0] },
                { time: 1.1, energy: [0.4, 0, 0, 0, 0, 0] },
            ]);
            hub.update(0.2);
            expect(hub.snapshot.bands[0]).toBeCloseTo(1, 5);
        });

        it('reads 0 with no frames', () => {
            hub.update(3);
            expect(Array.from(hub.snapshot.bands)).toEqual([0, 0, 0, 0, 0, 0]);
        });

        it('holds at least half a second of frames and drops the oldest when full', () => {
            expect(HUB_FRAME_CAPACITY).toBeGreaterThanOrEqual(50);
            // Frame 0 is very loud and is overwritten, so the peak it set (decayed over the short run) is the same
            // for every survivor; the others carry distinct energies, so reading the wrong slot gives a wrong value.
            const extra = 10;
            const many: FrameSpec[] = [];
            for (let i = 0; i < HUB_FRAME_CAPACITY + extra; i++) {
                many.push({ time: i * 0.001, energy: i === 0 ? 1000 : i });
            }
            feed(many);
            // Frame 0 was overwritten, so a time before everything reads the oldest survivor (frame 10), which
            // normalized against the peak at its own time.
            const peakAt = (i: number) => 1000 * Math.pow(0.5, (i * 0.001) / HUB_PEAK_HALF_LIFE_SECONDS);
            hub.update(-1);
            expect(hub.snapshot.bands[0]).toBeCloseTo(extra / peakAt(extra), 5);
            // Frames that sit across the wrap point each read their own value.
            for (const i of [extra + 1, HUB_FRAME_CAPACITY - 1, HUB_FRAME_CAPACITY, HUB_FRAME_CAPACITY + extra - 1]) {
                hub.update(i * 0.001 + 0.0001);
                expect(hub.snapshot.bands[0]).toBeCloseTo(i / peakAt(i), 5);
            }
        });

        it('reads the newest frame and reveals every received onset when the time is later than both', () => {
            // A negative sync offset makes the render time later than the newest frame the worklet has sent.
            feed(
                [
                    { time: 1.0, energy: 0.4 },
                    { time: 1.01, energy: 0.8 },
                ],
                [
                    { band: 0, time: 1.0 },
                    { band: 0, time: 1.02 },
                ],
            );
            hub.update(1.5);
            expect(hub.snapshot.bands[0]).toBeCloseTo(1, 5);
            expect(hub.snapshot.onsets.kick.count).toBe(2);
            expect(hub.snapshot.onsets.kick.lastTime).toBe(1.02);
        });
    });

    describe('normalization', () => {
        it('scales by the running peak so the loudest reads 1 and half of it reads 0.5', () => {
            feed([
                { time: 1.0, energy: 2 },
                { time: 1.01, energy: 1 },
            ]);
            hub.update(1.01);
            expect(hub.snapshot.bands[0]).toBeCloseTo(0.5, 2);
        });

        it('reads 0 for silence and does not stretch a faint hiss to 1', () => {
            feed([{ time: 1, energy: 0 }]);
            hub.update(1);
            expect(hub.snapshot.bands[0]).toBe(0);

            feed([{ time: 1.01, energy: HUB_MIN_PEAK / 10 }]);
            hub.update(1.01);
            expect(hub.snapshot.bands[0]).toBeCloseTo(0.1, 3);
        });

        it('decays the peak by frame time, not by call count', () => {
            // One loud frame, then quiet frames far enough apart for exactly one half-life to pass: a half-peak
            // value then reads about 1. Many tiny frames covering the same time must give the same result.
            const first = new AudioHub();
            first.start(tracker.asTracker());
            first.onBatch(batch([{ time: 0, energy: 4 }]));
            first.onBatch(batch([{ time: HUB_PEAK_HALF_LIFE_SECONDS, energy: 2 }]));
            first.update(HUB_PEAK_HALF_LIFE_SECONDS);

            const second = new AudioHub();
            second.start(tracker.asTracker());
            second.onBatch(batch([{ time: 0, energy: 4 }]));
            const steps = 300;
            const quiet: FrameSpec[] = [];
            for (let i = 1; i <= steps; i++) {
                quiet.push({ time: (HUB_PEAK_HALF_LIFE_SECONDS * i) / steps, energy: i === steps ? 2 : 0 });
            }
            second.onBatch(batch(quiet));
            second.update(HUB_PEAK_HALF_LIFE_SECONDS);

            expect(first.snapshot.bands[0]).toBeCloseTo(1, 3);
            expect(second.snapshot.bands[0]).toBeCloseTo(first.snapshot.bands[0], 3);
        });

        it('clamps to 0..1 and ignores a time step that is not forward', () => {
            feed([
                { time: 1, energy: 3 },
                { time: 1, energy: 2 },
                { time: 0.5, energy: 2 },
            ]);
            hub.update(2);
            expect(hub.snapshot.bands[0]).toBeGreaterThanOrEqual(0);
            expect(hub.snapshot.bands[0]).toBeLessThanOrEqual(1);
            // The backward step to 0.5 must not have decayed or moved the peak (3): the last frame, energy 2, reads
            // 2/3, and a later frame of 1.5, still before the peak's clock (1 s), is not decayed and reads 0.5.
            expect(hub.snapshot.bands[0]).toBeCloseTo(2 / 3, 5);
            feed([{ time: 0.501, energy: 1.5 }]);
            hub.update(0.501);
            expect(hub.snapshot.bands[0]).toBeCloseTo(0.5, 6);
            feed([{ time: 3, energy: -1 }]);
            hub.update(3);
            expect(hub.snapshot.bands[0]).toBe(0);
        });
    });

    describe('input hardening', () => {
        it('treats NaN and infinite energy as silence without poisoning the peak', () => {
            feed([
                { time: 1, energy: [NaN, Infinity, -Infinity, 0, 0, 0] },
                { time: 1.01, energy: 2 },
                { time: 1.02, energy: 1 },
            ]);
            hub.update(1);
            expect(Array.from(hub.snapshot.bands)).toEqual([0, 0, 0, 0, 0, 0]);
            hub.update(1.02);
            for (let b = 0; b < 3; b++) {
                expect(hub.snapshot.bands[b]).toBeCloseTo(0.5, 2);
            }
        });

        it('ignores a batch of another version', () => {
            const other = { ...batch([{ time: 1, energy: 1 }], [{ band: 0, time: 1 }]), version: 1 };
            hub.onBatch(other as unknown as FeatureBatch);
            hub.update(5);
            expect(Array.from(hub.snapshot.bands)).toEqual([0, 0, 0, 0, 0, 0]);
            expect(hub.snapshot.onsets.kick.count).toBe(0);
        });

        it('warns once per hub in development about batches of another version, and never otherwise', () => {
            const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
            const other = { ...batch([{ time: 1, energy: 1 }]), version: 1 } as unknown as FeatureBatch;
            vi.stubEnv('DEV', true);
            hub.onBatch(other);
            hub.onBatch(other);
            expect(warn).toHaveBeenCalledTimes(1);
            const quiet = new AudioHub();
            vi.stubEnv('DEV', false);
            quiet.onBatch(other);
            quiet.onBatch(other);
            expect(warn).toHaveBeenCalledTimes(1);
            vi.unstubAllEnvs();
            warn.mockRestore();
        });

        it('does not move the peak clock back on a frame stamped earlier', () => {
            feed([{ time: 10, energy: 1 }]);
            feed([{ time: 5, energy: 0.1 }]);
            feed([{ time: 10.001, energy: 0.5 }]);
            hub.update(10.001);
            // Decayed by 1 ms since the loud frame, not by the 5 s back to the stray one.
            expect(hub.snapshot.bands[0]).toBeCloseTo(0.5, 3);
        });
    });

    describe('gate-input bass', () => {
        const SUB = HUB_BANDS.indexOf('sub');
        const KICK = HUB_BANDS.indexOf('kick');
        const energies = (sub: number, kick: number) =>
            HUB_BANDS.map((_, b) => (b === SUB ? sub : b === KICK ? kick : 0.9));

        it('reads the unscaled low end of the same frame as the bands', () => {
            feed([
                { time: 1.0, energy: energies(0.3, 0.6) },
                { time: 1.1, energy: energies(0.5, 0.2) },
            ]);
            const gateBass = hub.snapshot.gateBass;
            hub.update(1.05);
            expect(gateBass.lowEnd).toBeCloseTo(0.6, 6);
            hub.update(1.1);
            expect(gateBass.lowEnd).toBeCloseTo(0.5, 6);
            // Updated in place: consumers may hold on to the object.
            expect(hub.snapshot.gateBass).toBe(gateBass);
        });

        it('does not scale the low end by the running peak, unlike the bands', () => {
            feed([
                { time: 1.0, energy: energies(2, 0) },
                { time: 1.1, energy: energies(1, 0) },
            ]);
            hub.update(1.1);
            expect(hub.snapshot.bands[SUB]).toBeCloseTo(0.5, 1);
            expect(hub.snapshot.gateBass.lowEnd).toBeCloseTo(1, 6);
        });

        it('taps the tracker source with the gate-input bass filters and reads its level at every update', () => {
            const { source, nodes } = stubSource(0.25);
            tracker.source = source;
            hub.update(1);
            expect(hub.snapshot.gateBass.pulse).toBeCloseTo(0.25, 6);
            const filters = nodes.filter((built) => built.type !== undefined);
            expect(filters.map((filter) => filter.type)).toEqual(['lowpass', 'lowpass']);
            for (const filter of filters) {
                expect(filter.frequency).toEqual({ value: GATE_BASS_CUTOFF_HZ });
                expect(filter.Q).toEqual({ value: Math.SQRT1_2 });
            }
            expect(nodes.find((built) => built.fftSize !== undefined)?.fftSize).toBe(GATE_BASS_WINDOW);
            // The source feeds the first filter, the first the second, the second the analyser.
            expect(source.connect).toHaveBeenCalledWith(filters[0]);
            // The same source is tapped once, however many updates read it.
            const built = nodes.length;
            hub.update(2);
            expect(nodes.length).toBe(built);
        });

        it('taps a new source afresh, disconnecting the old tap, and reads 0 with no source', () => {
            const first = stubSource(0.25);
            tracker.source = first.source;
            hub.update(1);
            const second = stubSource(0.5);
            tracker.source = second.source;
            hub.update(2);
            expect(hub.snapshot.gateBass.pulse).toBeCloseTo(0.5, 6);
            expect(first.source.disconnect).toHaveBeenCalled();
            // The old filters and analyser are disconnected too.
            expect(first.disconnected.length).toBe(4);
            tracker.source = undefined;
            hub.update(3);
            expect(hub.snapshot.gateBass.pulse).toBe(0);
            expect(second.disconnected.length).toBe(4);
        });

        it('reads 0 and disconnects the tap when the source goes away, with no explicit time', () => {
            const { source, disconnected } = stubSource(0.25);
            tracker.source = source;
            hub.update();
            expect(hub.snapshot.gateBass.pulse).toBeCloseTo(0.25, 6);
            // A stopped capture: the real tracker has no source and so no render time either.
            tracker.source = undefined;
            tracker.now = undefined;
            hub.update();
            expect(hub.snapshot.gateBass.pulse).toBe(0);
            expect(disconnected.length).toBe(4);
        });

        it('keeps the tap and the pulse across a transiently undefined render time with the same source', () => {
            const { source, nodes, disconnected, setLevel } = stubSource(0.25);
            tracker.source = source;
            hub.update();
            const built = nodes.length;
            const { bands, onsets, beat, section } = structuredClone({
                bands: Array.from(hub.snapshot.bands),
                onsets: hub.snapshot.onsets,
                beat: hub.snapshot.beat,
                section: hub.snapshot.section,
            });
            tracker.now = undefined;
            // The tap is still read: a new level shows up as the new pulse.
            setLevel(0.6);
            hub.update();
            expect(hub.snapshot.gateBass.pulse).toBeCloseTo(0.6, 6);
            expect(nodes.length).toBe(built);
            expect(disconnected.length).toBe(0);
            // The rest of the snapshot is left alone without a render time.
            expect(hub.snapshot.time).toBe(10);
            expect(Array.from(hub.snapshot.bands)).toEqual(bands);
            expect(hub.snapshot.onsets).toEqual(onsets);
            expect(hub.snapshot.beat).toEqual(beat);
            expect(hub.snapshot.section).toEqual(section);
        });

        it('does nothing without a render time or a started tracker', () => {
            const fresh = new AudioHub({ gateBass: { level: () => 0.3, dispose: vi.fn() } });
            fresh.update();
            expect(fresh.snapshot.gateBass.pulse).toBe(0);
        });

        it('reads the pulse at an explicit time as before, even when the render time is undefined', () => {
            const { source } = stubSource(0.4);
            tracker.source = source;
            tracker.now = undefined;
            hub.update(5);
            expect(hub.snapshot.time).toBe(5);
            expect(hub.snapshot.gateBass.pulse).toBeCloseTo(0.4, 6);
        });

        it('disconnects its tap when disposed', () => {
            const { source, disconnected } = stubSource(0.25);
            tracker.source = source;
            hub.update(1);
            hub.dispose();
            expect(disconnected.length).toBe(4);
        });

        it('taps exactly once per start across a StrictMode-style start, dispose, start', () => {
            const { source, nodes, disconnected } = stubSource(0.25);
            tracker.source = source;
            hub.update(1);
            const built = nodes.length;
            hub.dispose();
            expect(disconnected.length).toBe(4);
            hub.start(tracker.asTracker());
            hub.update(2);
            // One more tap: two filters and an analyser.
            expect(nodes.length).toBe(built + 3);
        });

        it('reads a given level reader instead of tapping, and treats a non-finite level as silence', () => {
            let level = 0.3;
            const reader = { level: vi.fn(() => level), dispose: vi.fn() };
            const fixed = new AudioHub({ gateBass: reader });
            fixed.update(1);
            expect(fixed.snapshot.gateBass.pulse).toBeCloseTo(0.3, 6);
            // Read once per render time.
            fixed.update(1);
            expect(reader.level).toHaveBeenCalledTimes(1);
            level = Number.NaN;
            fixed.update(2);
            expect(fixed.snapshot.gateBass.pulse).toBe(0);
        });

        it('reads 0 before the first update and after a reset, and a non-finite low end as silence', () => {
            expect(hub.snapshot.gateBass).toEqual({ pulse: 0, lowEnd: 0 });
            hub.update(1);
            expect(hub.snapshot.gateBass).toEqual({ pulse: 0, lowEnd: 0 });
            feed([{ time: 2, energy: energies(Number.NaN, Infinity) }]);
            hub.update(2);
            expect(hub.snapshot.gateBass.lowEnd).toBe(0);
            tracker.source = stubSource(0.3).source;
            feed([{ time: 3, energy: energies(0.4, 0.1) }]);
            hub.update(3);
            expect(hub.snapshot.gateBass).toEqual({ pulse: expect.closeTo(0.3, 6), lowEnd: expect.closeTo(0.4, 6) });
            hub.onReset();
            expect(hub.snapshot.gateBass).toEqual({ pulse: 0, lowEnd: 0 });
        });
    });

    describe('onsets', () => {
        it('starts with nothing seen', () => {
            hub.update(1);
            for (const onset of Object.values(hub.snapshot.onsets)) {
                expect(onset).toEqual({ lastTime: -Infinity, strength: 0, sinceSeconds: Infinity, count: 0 });
            }
        });

        it('holds an event back until the snapshot time reaches it', () => {
            feed([{ time: 1, energy: 1 }], [{ band: 0, time: 1.5, strength: 0.7 }]);
            hub.update(1.4);
            expect(hub.snapshot.onsets.kick.count).toBe(0);
            expect(hub.snapshot.onsets.kick.sinceSeconds).toBe(Infinity);

            hub.update(1.5);
            const kick = hub.snapshot.onsets.kick;
            expect(kick.count).toBe(1);
            expect(kick.lastTime).toBe(1.5);
            expect(kick.strength).toBeCloseTo(0.7, 5);
            expect(kick.sinceSeconds).toBe(0);
        });

        it('keeps the kinds apart, grows sinceSeconds with time and counts each event once', () => {
            feed(
                [{ time: 1, energy: 1 }],
                [
                    { band: 2, time: 1, strength: 0.5 },
                    { band: 3, time: 1.2, strength: 0.9 },
                    { band: 2, time: 1.3, strength: 0.6 },
                ],
            );
            hub.update(1.3);
            expect(hub.snapshot.onsets.snare.count).toBe(2);
            expect(hub.snapshot.onsets.snare.lastTime).toBe(1.3);
            expect(hub.snapshot.onsets.snare.strength).toBeCloseTo(0.6, 5);
            expect(hub.snapshot.onsets.highs.count).toBe(1);
            expect(hub.snapshot.onsets.kick.count).toBe(0);
            hub.update(1.8);
            expect(hub.snapshot.onsets.snare.count).toBe(2);
            expect(hub.snapshot.onsets.snare.sinceSeconds).toBeCloseTo(0.5, 5);
        });

        it('never reports a negative age when the time moves back', () => {
            feed([{ time: 1, energy: 1 }], [{ band: 0, time: 1 }]);
            hub.update(1.2);
            hub.update(0.9);
            expect(hub.snapshot.onsets.kick.sinceSeconds).toBe(0);
        });

        it('does not let an older event replace a newer one of the same kind', () => {
            feed([{ time: 1, energy: 1 }], [{ band: 0, time: 1.2, strength: 0.9 }]);
            feed([{ time: 1.1, energy: 1 }], [{ band: 0, time: 1.1, strength: 0.3 }]);
            hub.update(2);
            expect(hub.snapshot.onsets.kick.count).toBe(2);
            expect(hub.snapshot.onsets.kick.lastTime).toBe(1.2);
            expect(hub.snapshot.onsets.kick.strength).toBeCloseTo(0.9, 5);
        });

        it('keeps later events pending in order while revealing earlier ones', () => {
            feed(
                [{ time: 1, energy: 1 }],
                [
                    { band: 0, time: 5 },
                    { band: 1, time: 2 },
                    { band: 2, time: 6 },
                ],
            );
            hub.update(3);
            expect(hub.snapshot.onsets.bass.count).toBe(1);
            expect(hub.snapshot.onsets.kick.count).toBe(0);
            hub.update(10);
            expect(hub.snapshot.onsets.kick.count).toBe(1);
            expect(hub.snapshot.onsets.snare.count).toBe(1);
            expect(hub.snapshot.onsets.snare.lastTime).toBe(6);
        });

        it('drops the oldest pending event when the list is full and ignores unknown kinds', () => {
            const events: OnsetSpec[] = [];
            for (let i = 0; i < HUB_PENDING_ONSET_CAPACITY + 1; i++) {
                events.push({ band: 0, time: 100 + i });
            }
            events.push({ band: 9, time: 100 });
            feed([{ time: 1, energy: 1 }], events);
            hub.update(1000);
            expect(hub.snapshot.onsets.kick.count).toBe(HUB_PENDING_ONSET_CAPACITY);
            // The oldest (time 100) was dropped; the newest survived.
            expect(hub.snapshot.onsets.kick.lastTime).toBe(100 + HUB_PENDING_ONSET_CAPACITY);
        });
    });

    describe('beat and section', () => {
        it('copies the tracker state after updatePhase(time)', () => {
            const { state } = tracker;
            state.beatPhase = 0.25;
            state.barPhase = 0.5;
            state.bpm = 120;
            state.tempoConfidence = 0.8;
            state.beatsPerBar = 4;
            state.meterConfidence = METER_VISUAL_CONFIDENCE;
            state.beatCount = 7;
            state.downbeatCount = 2;
            hub.update(4);

            expect(tracker.updatePhase).toHaveBeenCalledWith(4);
            expect(hub.snapshot.beat).toEqual({
                phase: 0.25,
                barPhase: 0.5,
                tempo: 120,
                confidence: 0.8,
                locked: true,
                beatsPerBar: 4,
                barLocked: true,
                beatCount: 7,
                downbeatCount: 2,
            });
        });

        it('is locked only with a tempo and a phase, and bar locked only with a confident meter', () => {
            const { state } = tracker;
            state.bpm = 120;
            state.beatPhase = undefined;
            state.beatsPerBar = 3;
            state.meterConfidence = METER_VISUAL_CONFIDENCE - 0.01;
            hub.update(1);
            expect(hub.snapshot.beat.locked).toBe(false);
            expect(hub.snapshot.beat.barLocked).toBe(false);

            state.beatPhase = 0.1;
            state.bpm = 0;
            hub.update(2);
            expect(hub.snapshot.beat.locked).toBe(false);

            state.bpm = 100;
            state.beatsPerBar = undefined;
            state.meterConfidence = 1;
            hub.update(3);
            expect(hub.snapshot.beat.locked).toBe(true);
            expect(hub.snapshot.beat.barLocked).toBe(false);
        });

        it('ignores a song change from before the hub started', () => {
            const late = new StubTracker();
            late.state.songChangeCount = 3;
            const other = new AudioHub();
            other.start(late.asTracker());
            other.update(5);
            expect(other.snapshot.section).toEqual({ changeCount: 3, lastChangeTime: -Infinity });
        });

        it('stamps a new change with the snapshot time it first sees it, once', () => {
            hub.update(5);
            expect(hub.snapshot.section.lastChangeTime).toBe(-Infinity);
            tracker.state.songChangeCount = 1;
            hub.update(6);
            expect(hub.snapshot.section).toEqual({ changeCount: 1, lastChangeTime: 6 });
            hub.update(7);
            expect(hub.snapshot.section).toEqual({ changeCount: 1, lastChangeTime: 6 });
            tracker.state.songChangeCount = 2;
            hub.update(8);
            expect(hub.snapshot.section).toEqual({ changeCount: 2, lastChangeTime: 8 });
        });
    });

    describe('no source (contract C5)', () => {
        // Frames, a revealed kick onset, a locked beat and one song change, read at time 2 with a bound source.
        function playing() {
            tracker.source = stubSource(0.25).source;
            const { state } = tracker;
            state.beatPhase = 0.25;
            state.barPhase = 0.5;
            state.bpm = 120;
            state.tempoConfidence = 0.8;
            state.beatsPerBar = 4;
            state.meterConfidence = 1;
            state.beatCount = 7;
            state.downbeatCount = 2;
            state.songChangeCount = 1;
            feed(
                [
                    { time: 1, energy: 1 },
                    { time: 2, energy: 1 },
                ],
                [{ band: 0, time: 1.5, strength: 0.7 }],
            );
            hub.update(2);
        }

        it('puts the snapshot at rest when the source is gone, keeping the counters and times', () => {
            playing();
            expect(hub.snapshot.beat.locked).toBe(true);
            expect(hub.snapshot.bands[0]).toBe(1);

            // A stopped capture: the tracker has no source and so no render time. Its state still holds the old beat.
            tracker.source = undefined;
            tracker.now = undefined;
            hub.update();

            const { snapshot } = hub;
            expect(Array.from(snapshot.bands)).toEqual(new Array<number>(HUB_BAND_COUNT).fill(0));
            expect(snapshot.gateBass).toEqual({ pulse: 0, lowEnd: 0 });
            expect(snapshot.onsets.kick).toEqual({ lastTime: 1.5, strength: 0, sinceSeconds: Infinity, count: 1 });
            expect(snapshot.beat).toEqual({
                phase: undefined,
                barPhase: undefined,
                tempo: 0,
                confidence: 0,
                locked: false,
                beatsPerBar: undefined,
                barLocked: false,
                beatCount: 7,
                downbeatCount: 2,
            });
            expect(snapshot.section).toEqual({ changeCount: 1, lastChangeTime: 2 });
            expect(snapshot.time).toBe(2);
        });

        it('rests without a started tracker too', () => {
            const bare = new AudioHub();
            bare.onBatch(batch([{ time: 1, energy: 1 }]));
            bare.update(1);
            expect(bare.snapshot.bands[0]).toBe(1);
            bare.update();
            expect(bare.snapshot.bands[0]).toBe(0);
        });

        it('reads normally again at the next render time, even the one it last read', () => {
            playing();
            tracker.source = undefined;
            tracker.now = undefined;
            hub.update();
            expect(hub.snapshot.beat.locked).toBe(false);

            // The same source comes back without a reset (the tracker resets only for a new source).
            tracker.source = stubSource(0.25).source;
            hub.update(2);
            expect(hub.snapshot.beat.locked).toBe(true);
            expect(hub.snapshot.bands[0]).toBe(1);
            // An onset seen before the rest is not shown again: its strength stays 0 until the next one arrives.
            expect(hub.snapshot.onsets.kick.strength).toBe(0);
            feed([{ time: 3, energy: 1 }], [{ band: 0, time: 2.5, strength: 0.6 }]);
            hub.update(3);
            expect(hub.snapshot.onsets.kick).toMatchObject({ lastTime: 2.5, count: 2 });
            expect(hub.snapshot.onsets.kick.strength).toBeCloseTo(0.6, 6);
        });
    });

    describe('update', () => {
        it('reads the tracker render time without an argument', () => {
            tracker.now = 12.5;
            hub.update();
            expect(hub.snapshot.time).toBe(12.5);
        });

        it('keeps the snapshot time and does not read the tracker when there is no render time', () => {
            hub.update(4);
            tracker.now = undefined;
            tracker.state.bpm = 90;
            hub.update();
            expect(hub.snapshot.time).toBe(4);
            expect(hub.snapshot.beat.tempo).toBe(0);
        });

        it('does nothing when called again with the same time', () => {
            hub.update(4);
            tracker.updatePhase.mockClear();
            tracker.state.bpm = 90;
            feed([{ time: 3, energy: 1 }]);
            hub.update(4);
            expect(tracker.updatePhase).not.toHaveBeenCalled();
            expect(hub.snapshot.beat.tempo).toBe(0);
            hub.update(4.01);
            expect(hub.snapshot.beat.tempo).toBe(90);
        });

        it('does nothing without a tracker and without a time, and reads bands and onsets with a time', () => {
            const bare = new AudioHub();
            bare.update();
            expect(bare.snapshot.time).toBe(0);
            bare.update(2);
            expect(bare.snapshot.time).toBe(2);
            expect(bare.snapshot.beat.tempo).toBe(0);
        });

        it('keeps running for many frames without growing its rings', () => {
            for (let i = 0; i < 2000; i++) {
                feed([{ time: i * 0.01, energy: 1 }], [{ band: i % 4, time: i * 0.01 }]);
                hub.update(i * 0.01);
            }
            expect(hub.snapshot.onsets.kick.count).toBe(500);
        });
    });

    describe('reset', () => {
        it('clears frames, pending onsets and peaks but keeps the counters', () => {
            feed(
                [{ time: 1, energy: 4 }],
                [
                    { band: 0, time: 1 },
                    { band: 1, time: 50 },
                ],
            );
            hub.update(2);
            expect(hub.snapshot.bands[0]).toBe(1);
            expect(hub.snapshot.onsets.kick.count).toBe(1);

            hub.onReset();
            expect(Array.from(hub.snapshot.bands)).toEqual([0, 0, 0, 0, 0, 0]);

            // The pending bass event is gone, and the peak is forgotten: a quiet frame now reads full scale.
            feed([{ time: 3, energy: 1 }]);
            hub.update(100);
            expect(hub.snapshot.onsets.bass.count).toBe(0);
            expect(hub.snapshot.bands[0]).toBe(1);
            expect(hub.snapshot.onsets.kick.count).toBe(1);

            feed([{ time: 4, energy: 1 }], [{ band: 0, time: 4 }]);
            hub.update(101);
            expect(hub.snapshot.onsets.kick.count).toBe(2);
        });

        it('forgets onset and change times from the old clock, so nothing reads as just happened', () => {
            tracker.state.songChangeCount = 1;
            feed([{ time: 50, energy: 1 }], [{ band: 0, time: 50, strength: 0.8 }]);
            hub.update(60);
            expect(hub.snapshot.section.lastChangeTime).toBe(60);

            // The new source's AudioContext starts its clock near 0, far before the old times.
            hub.onReset();
            feed([{ time: 0.5, energy: 1 }]);
            hub.update(1);
            const kick = hub.snapshot.onsets.kick;
            expect(kick.lastTime).toBe(-Infinity);
            expect(kick.strength).toBe(0);
            expect(kick.sinceSeconds).toBe(Infinity);
            expect(kick.count).toBe(1);
            expect(hub.snapshot.section.lastChangeTime).toBe(-Infinity);
        });

        it('reads again at the same time after a reset', () => {
            feed([{ time: 1, energy: 1 }]);
            hub.update(2);
            hub.onReset();
            feed([{ time: 1.5, energy: 0.5 }]);
            hub.update(2);
            expect(hub.snapshot.bands[0]).toBe(1);
        });
    });
});
