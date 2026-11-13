// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { asWebAudio, FakeAnalyserNode, FakeAudioContext, FakeGainNode } from '~/test/fakeWebAudio';
import type { AudioEngine } from './audioEngine';
import type { FilePlayback } from './devFileSource';
import {
    attachTelemetry,
    getTelemetryView,
    registerTelemetryProbe,
    subscribeTelemetryProbes,
    telemetryProbeCount,
    tickTelemetry,
} from './devTelemetry';

const { playbackRef } = vi.hoisted(() => ({ playbackRef: { current: undefined as unknown } }));
vi.mock('./devFileSource', () => ({ getActivePlayback: () => playbackRef.current }));

// A stand-in for the parts of AudioEngine that telemetry uses.
class StubEngine {
    private readonly listeners = new Set<() => void>();
    input: FakeGainNode | undefined;
    post: FakeAnalyserNode | undefined;
    gain = 1;
    normalizeOn = true;
    readonly getNormalize = () => this.normalizeOn;
    readonly setNormalize = (enabled: boolean) => {
        this.normalizeOn = enabled;
    };
    readonly subscribe = (listener: () => void) => {
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
    };
    readonly getInputNode = () => this.input;
    readonly getAnalyser = () => this.post;
    readonly getGain = () => this.gain;
    get listenerCount() {
        return this.listeners.size;
    }
    notify() {
        this.listeners.forEach((listener) => listener());
    }
    useContext(context = new FakeAudioContext()) {
        this.input = new FakeGainNode(context);
        this.post = new FakeAnalyserNode(context);
        this.notify();
        return context;
    }
}

// Attaches with a running source unless the engine already has one or `withSource` is false.
function attach(engine = new StubEngine(), withSource = true) {
    if (withSource && !engine.post) {
        engine.useContext();
    }
    const detach = attachTelemetry(asWebAudio<AudioEngine>(engine));
    return { engine, detach };
}

const hook = () => window.__vizTelemetry!;
const cleanups: Array<() => void> = [];
function probe(name: string, columns: string[], read: (out: Float32Array) => void = () => {}) {
    const unregister = registerTelemetryProbe(name, columns, read);
    cleanups.push(unregister);
    return unregister;
}

afterEach(() => {
    cleanups.splice(0).forEach((cleanup) => cleanup());
    playbackRef.current = undefined;
});

describe('probes and the column layout', () => {
    it('lists the base columns, then each probe as <name>.<column> in registration order', () => {
        const { detach } = attach();
        probe('a', ['in', 'out']);
        probe('b', ['x']);

        expect(hook().columns).toEqual([
            't',
            'dt',
            'fps',
            'bassRaw',
            'bassPost',
            'gain',
            'onsetKick',
            'onsetMid',
            'onsetHigh',
            'a.in',
            'a.out',
            'b.x',
        ]);
        detach();
    });

    it('resets the rows when a probe is registered or unregistered', () => {
        const { detach } = attach();
        tickTelemetry(0.01);
        expect(hook().rowCount).toBe(1);

        const unregister = probe('a', ['in']);
        expect(hook().rowCount).toBe(0);
        tickTelemetry(0.01);
        unregister();
        expect(hook().rowCount).toBe(0);
        expect(hook().columns).toHaveLength(9);
        unregister(); // a second call does nothing
        detach();
    });

    it('counts probes and tells subscribers when they change', () => {
        const listener = vi.fn();
        const unsubscribe = subscribeTelemetryProbes(listener);
        const unregister = probe('a', ['in']);
        expect(telemetryProbeCount()).toBe(1);
        unregister();
        expect(telemetryProbeCount()).toBe(0);
        expect(listener).toHaveBeenCalledTimes(2);

        unsubscribe();
        probe('b', ['in']);
        expect(listener).toHaveBeenCalledTimes(2);
    });
});

describe('tickTelemetry', () => {
    it('does nothing while nothing is attached', () => {
        tickTelemetry(0.01);
        expect(getTelemetryView()).toBeUndefined();
        expect(window.__vizTelemetry).toBeUndefined();
    });

    it('writes one row per tick with dt, fps, gain and the probe columns', () => {
        const { engine, detach } = attach();
        engine.useContext().currentTime = 2.5;
        engine.gain = 3;
        probe('a', ['in', 'out'], (out) => {
            out[0] = 0.25;
            out[1] = 0.5;
        });

        tickTelemetry(0.0125);
        tickTelemetry(0.02);
        tickTelemetry(0);

        const rows = hook().snapshot();
        expect(hook().rowCount).toBe(3);
        expect(rows).toHaveLength(3 * 11);
        expect(Array.from(rows.slice(0, 11))).toEqual([2.5, 0.0125, 80, 0, 0, 3, 0, 0, 0, 0.25, 0.5].map(Math.fround));
        expect(rows[11 + 1]).toBeCloseTo(0.02);
        expect(rows[11 + 2]).toBeCloseTo(50);
        expect(rows[22 + 2]).toBe(0);
        detach();
    });

    it('takes t from the active file playback when there is one', () => {
        const { engine, detach } = attach();
        engine.useContext().currentTime = 9;
        playbackRef.current = { position: () => 4.5 } as FilePlayback;

        tickTelemetry(0.01);

        expect(hook().snapshot()[0]).toBe(4.5);
        detach();
    });

    it('writes no rows while no source exists', () => {
        const { detach } = attach(new StubEngine(), false);
        tickTelemetry(0.01);
        expect(hook().rowCount).toBe(0);
        detach();
    });

    it('averages the bass bins up to 120 Hz from the pre- and post-gain analysers', () => {
        const { engine, detach } = attach();
        const context = engine.useContext();
        // 48 kHz over 4096 samples is 11.7 Hz per bin, so 10 bins reach 120 Hz.
        const [raw, post] = context.createdAnalysers;
        expect(raw.fftSize).toBe(4096);
        expect(raw.smoothingTimeConstant).toBe(0);
        raw.setByteFrequencyData([255, 255, 255, 255, 255, 0, 0, 0, 0, 0, 255]);
        post.setByteFrequencyData(51);

        tickTelemetry(0.01);

        const row = hook().snapshot();
        expect(row[3]).toBeCloseTo(0.5);
        expect(row[4]).toBeCloseTo(0.2);
        detach();
    });

    it('stops at capacity and flags the overflow without overwriting', () => {
        const { detach } = attach();
        let value = 0;
        probe('a', ['in'], (out) => {
            out[0] = ++value;
        });
        hook().reset(1 / 240); // less than one row's worth of seconds still holds one row
        tickTelemetry(0.01);
        tickTelemetry(0.01);
        tickTelemetry(0.01);

        expect(hook().rowCount).toBe(1);
        expect(hook().overflowed).toBe(true);
        expect(hook().snapshot()[9]).toBe(1);
        detach();
    });

    it('holds capacitySeconds * 120 rows and clears the overflow on reset', () => {
        const { detach } = attach();
        hook().reset(0.05); // 6 rows
        for (let i = 0; i < 6; i++) tickTelemetry(0.01);
        expect(hook().overflowed).toBe(false);
        tickTelemetry(0.01);
        expect(hook().overflowed).toBe(true);

        hook().reset();
        expect(hook().rowCount).toBe(0);
        expect(hook().overflowed).toBe(false);
        tickTelemetry(0.01);
        expect(hook().rowCount).toBe(1);

        // An invalid size keeps the current capacity.
        hook().reset(-3);
        hook().reset(Number.NaN);
        for (let i = 0; i < 7; i++) tickTelemetry(0.01);
        expect(hook().rowCount).toBe(6);

        hook().reset(600); // back to the default for the next test
        detach();
    });

    it('defaults to ten minutes of rows', () => {
        const { detach } = attach();
        expect(getTelemetryView()!.rows).toHaveLength(600 * 120 * 9);
        detach();
    });
});

describe('onsets and normalization', () => {
    const FIRST_ONSET = 6;

    it('records the tracker band onsets in the base columns, and zeros without a tracker', () => {
        const engine = new StubEngine();
        engine.useContext();
        const detach = attachTelemetry(asWebAudio<AudioEngine>(engine), {
            bandOnsets: Float32Array.of(0.5, 0.25),
        });
        tickTelemetry(0.01);
        // The third band is missing from the two-entry array and reads as 0.
        expect(
            Array.from(
                hook()
                    .snapshot()
                    .slice(FIRST_ONSET, FIRST_ONSET + 3),
            ),
        ).toEqual([0.5, 0.25, 0]);
        detach();

        const bare = attach();
        tickTelemetry(0.01);
        expect(
            Array.from(
                hook()
                    .snapshot()
                    .slice(FIRST_ONSET, FIRST_ONSET + 3),
            ),
        ).toEqual([0, 0, 0]);
        bare.detach();
    });

    it('turns the engine normalization off and on through the hook', () => {
        const { engine, detach } = attach();
        expect(hook().normalize()).toBe(true);
        hook().setNormalize(false);
        expect(engine.normalizeOn).toBe(false);
        expect(hook().normalize()).toBe(false);
        detach();
    });
});

describe('the window hook', () => {
    it('installs on attach and is removed by detach', () => {
        const { engine, detach } = attach();
        expect(window.__vizTelemetry).toBeDefined();
        expect(engine.listenerCount).toBe(1);

        detach();

        expect(window.__vizTelemetry).toBeUndefined();
        expect(engine.listenerCount).toBe(0);
        expect(getTelemetryView()).toBeUndefined();
    });

    it('snapshots a copy that later ticks do not change', () => {
        const { detach } = attach();
        tickTelemetry(0.01);
        const copy = hook().snapshot();
        copy[1] = 99;
        expect(hook().snapshot()[1]).toBeCloseTo(0.01);
        detach();
    });

    it('reports and seeks the active playback, and tolerates having none', () => {
        const { detach } = attach();
        expect(hook().playback()).toBeNull();
        expect(() => hook().seek(3)).not.toThrow();

        const seek = vi.fn();
        playbackRef.current = { position: () => 1.5, duration: 30, ended: false, seek } as unknown as FilePlayback;
        expect(hook().playback()).toEqual({ position: 1.5, duration: 30, ended: false });
        hook().seek(12);
        expect(seek).toHaveBeenCalledWith(12);
        detach();
    });

    it('replaces an earlier attachment, and an old detach does not remove the new one', () => {
        const first = attach();
        const second = attach();

        first.detach();
        expect(window.__vizTelemetry).toBeDefined();
        expect(first.engine.listenerCount).toBe(0);

        second.detach();
        expect(window.__vizTelemetry).toBeUndefined();
    });

    it('hands the overlay a live view of the rows', () => {
        const { detach } = attach();
        probe('a', ['in']);
        tickTelemetry(0.01);

        const view = getTelemetryView()!;
        expect(view.rowCount).toBe(1);
        expect(view.columns.at(-1)).toBe('a.in');
        detach();
    });
});

describe('analyser binding', () => {
    it('taps the input and the analyser in parallel and disconnects them on detach', () => {
        const { engine, detach } = attach();
        const context = engine.useContext();
        const [raw, post] = context.createdAnalysers;

        expect(engine.input!.connect).toHaveBeenCalledWith(raw);
        expect(engine.post!.connect).toHaveBeenCalledWith(post);

        detach();
        expect(engine.input!.disconnect).toHaveBeenCalledWith(raw);
        expect(raw.disconnect).toHaveBeenCalled();
        expect(engine.post!.disconnect).toHaveBeenCalledWith(post);
    });

    it('binds at attach time when a source is already running', () => {
        const engine = new StubEngine();
        const context = engine.useContext();
        const { detach } = attach(engine);

        expect(context.createdAnalysers).toHaveLength(2);
        detach();
    });

    it('rebinds to the new context when the engine changes graph, and ignores unrelated notifications', () => {
        const { engine, detach } = attach();
        const first = engine.useContext();
        const oldInput = engine.input!;
        const [oldRaw] = first.createdAnalysers;

        const second = engine.useContext();
        expect(oldInput.disconnect).toHaveBeenCalledWith(oldRaw);
        expect(second.createdAnalysers).toHaveLength(2);

        // Same nodes again: nothing new is created.
        engine.notify();
        expect(second.createdAnalysers).toHaveLength(2);
        detach();
    });

    it('stops writing rows when the source stops', () => {
        const { engine, detach } = attach();
        tickTelemetry(0.01);
        engine.input = undefined;
        engine.post = undefined;
        engine.notify();

        tickTelemetry(0.01);
        expect(hook().rowCount).toBe(1);
        detach();
    });

    it('survives disconnecting from a closed context', () => {
        const { engine, detach } = attach();
        const context = engine.useContext();
        const failing = () => {
            throw new Error('closed');
        };
        engine.input!.disconnect.mockImplementation(failing);
        engine.post!.disconnect.mockImplementation(failing);
        context.createdAnalysers.forEach((analyser) => analyser.disconnect.mockImplementation(failing));

        expect(() => detach()).not.toThrow();
    });
});

describe('outside DEV', () => {
    it('makes every entry point a no-op', () => {
        vi.stubEnv('DEV', false);
        const listener = vi.fn();
        subscribeTelemetryProbes(listener);

        const unregister = registerTelemetryProbe('a', ['in'], () => {});
        const detach = attachTelemetry(asWebAudio<AudioEngine>(new StubEngine()));
        tickTelemetry(0.01);

        expect(telemetryProbeCount()).toBe(0);
        expect(window.__vizTelemetry).toBeUndefined();
        expect(getTelemetryView()).toBeUndefined();
        expect(listener).not.toHaveBeenCalled();
        expect(() => {
            unregister();
            detach();
        }).not.toThrow();
        vi.unstubAllEnvs();
    });
});
