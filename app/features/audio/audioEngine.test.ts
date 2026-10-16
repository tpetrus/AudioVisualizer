// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createFakeDevice, installFakeMediaDevices, type FakeMediaOptions } from '~/test/fakeMedia';
import { createFakeStream, installFakeWebAudio, type FakeAnalyserNode, type FakeAudioContext, type FakeGainNode } from '~/test/fakeWebAudio';
import { AudioEngine } from './audioEngine';
import { loadNormalize, loadNormalizeSettings, loadSource, saveNormalizeSettings, saveSource } from './storage';
import { DEFAULT_NORMALIZE_SETTINGS } from './types';

// The nodes AudioEngine.connect() builds, in the order it creates them.
interface CapturedGraph {
    context: FakeAudioContext;
    gain: FakeGainNode;
    analyser: FakeAnalyserNode;
    meter: FakeAnalyserNode;
    outputMeter: FakeAnalyserNode;
}

function setup(media: FakeMediaOptions = {}) {
    const web = installFakeWebAudio();
    const mediaDevices = installFakeMediaDevices(media);
    const engine = new AudioEngine();
    const graph = (index = web.contexts.length - 1): CapturedGraph => {
        const context = web.contexts[index];
        const [analyser, meter, outputMeter] = context.createdAnalysers;
        return { context, gain: context.createdGains[0], analyser, meter, outputMeter };
    };
    return { web, media: mediaDevices, engine, graph };
}

beforeEach(() => {
    localStorage.clear();
});

afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
});

describe('screen capture', () => {
    it('asks for audio and video, keeps only the audio, and starts capturing', async () => {
        const displayStream = createFakeStream({ audio: true, video: true });
        const { engine, media, web, graph } = setup({ displayStream });

        await engine.startScreenCapture();

        expect(media.getDisplayMedia).toHaveBeenCalledWith({ audio: true, video: true });
        expect(displayStream.getVideoTracks()[0].stop).toHaveBeenCalled();
        expect(displayStream.getAudioTracks()[0].stop).not.toHaveBeenCalled();
        expect(engine.getIsCapturing()).toBe(true);
        expect(engine.getAnalyser()).toBe(graph().analyser);
        expect(web.contexts[0].resume).toHaveBeenCalled();
        expect(loadSource()).toEqual({ mode: 'screen' });
    });

    it('wires source -> gain -> analyser, with raw and normalized peak meters', async () => {
        const { engine, web, graph } = setup();
        await engine.startScreenCapture();

        const source = web.contexts[0].createdSources[0];
        const { gain, analyser, meter, outputMeter } = graph();
        expect(source.connect).toHaveBeenCalledWith(gain);
        expect(source.connect).toHaveBeenCalledWith(meter);
        expect(gain.connect).toHaveBeenCalledWith(analyser);
        expect(gain.connect).toHaveBeenCalledWith(outputMeter);
        expect(meter.fftSize).toBe(1024);
        expect(outputMeter.fftSize).toBe(1024);
        // Only the audio tracks reach the Web Audio graph.
        expect(web.streams.at(-1)?.getVideoTracks()).toHaveLength(0);
    });

    it('rejects, stops every track and never builds a graph when no audio was shared', async () => {
        const displayStream = createFakeStream({ audio: false, video: true });
        const { engine, web } = setup({ displayStream });

        await expect(engine.startScreenCapture()).rejects.toThrow('No audio was shared');

        displayStream.getTracks().forEach(track => expect(track.stop).toHaveBeenCalled());
        expect(web.contexts).toHaveLength(0);
        expect(engine.getIsCapturing()).toBe(false);
        expect(loadSource()).toBeUndefined();
    });

    it('passes on the error when the user cancels the share dialog', async () => {
        const { engine } = setup({ displayStream: new Error('Permission denied') });
        await expect(engine.startScreenCapture()).rejects.toThrow('Permission denied');
        expect(engine.getIsCapturing()).toBe(false);
    });
});

describe('device capture', () => {
    it('requests the exact device with voice processing turned off', async () => {
        const { engine, media } = setup();
        await engine.startDeviceCapture('stereo-mix');

        expect(media.getUserMedia).toHaveBeenCalledWith({
            audio: {
                deviceId: { exact: 'stereo-mix' },
                echoCancellation: false,
                noiseSuppression: false,
                autoGainControl: false,
            },
            video: false,
        });
        expect(engine.getIsCapturing()).toBe(true);
        expect(loadSource()).toEqual({ mode: 'device', deviceId: 'stereo-mix' });
    });

    it('does not remember the device when it cannot be opened', async () => {
        const { engine } = setup({ userStream: new Error('NotFoundError') });
        await expect(engine.startDeviceCapture('gone')).rejects.toThrow('NotFoundError');
        expect(loadSource()).toBeUndefined();
        expect(engine.getIsCapturing()).toBe(false);
    });
});

describe('getInputDevices', () => {
    it('lists audio inputs only, dropping the "communications" alias, and releases the permission probe', async () => {
        const userStream = createFakeStream({ audio: true });
        const devices = [
            createFakeDevice({ deviceId: 'mic', label: 'Mic' }),
            createFakeDevice({ deviceId: 'communications', label: 'Communications' }),
            createFakeDevice({ deviceId: 'speakers', kind: 'audiooutput', label: 'Speakers' }),
            createFakeDevice({ deviceId: 'cam', kind: 'videoinput', label: 'Camera' }),
        ];
        const { engine, media } = setup({ userStream, devices });

        const result = await engine.getInputDevices();

        expect(result.map(device => device.deviceId)).toEqual(['mic']);
        expect(media.getUserMedia).toHaveBeenCalledWith({ audio: true, video: false });
        expect(userStream.getTracks()[0].stop).toHaveBeenCalled();
    });

    it('rejects when microphone access is refused', async () => {
        const { engine } = setup({ userStream: new Error('NotAllowedError') });
        await expect(engine.getInputDevices()).rejects.toThrow('NotAllowedError');
    });
});

describe('resumeSavedSource', () => {
    it('resolves true at once when already capturing, without touching the permission', async () => {
        const { engine, media } = setup();
        await engine.startScreenCapture();

        await expect(engine.resumeSavedSource()).resolves.toBe(true);
        expect(media.query).not.toHaveBeenCalled();
    });

    it('is false with nothing saved, or with a saved screen capture (which cannot be restored)', async () => {
        const { engine, media } = setup();
        await expect(engine.resumeSavedSource()).resolves.toBe(false);
        saveSource({ mode: 'screen' });
        await expect(engine.resumeSavedSource()).resolves.toBe(false);
        expect(media.query).not.toHaveBeenCalled();
    });

    it('is false for a saved device without an id', async () => {
        const { engine } = setup();
        saveSource({ mode: 'device' });
        await expect(engine.resumeSavedSource()).resolves.toBe(false);
    });

    it.each<PermissionState>(['denied', 'prompt'])('never prompts: stays off when the microphone permission is %s', async permission => {
        const { engine, media } = setup({ permission });
        saveSource({ mode: 'device', deviceId: 'mic' });

        await expect(engine.resumeSavedSource()).resolves.toBe(false);
        expect(media.getUserMedia).not.toHaveBeenCalled();
        expect(engine.getIsCapturing()).toBe(false);
    });

    it('restores the saved device silently when the permission is already granted', async () => {
        const { engine, media } = setup({ permission: 'granted' });
        saveSource({ mode: 'device', deviceId: 'mic' });

        await expect(engine.resumeSavedSource()).resolves.toBe(true);
        expect(media.query).toHaveBeenCalledWith({ name: 'microphone' });
        expect(media.getUserMedia).toHaveBeenCalledTimes(1);
        expect(engine.getIsCapturing()).toBe(true);
    });

    it('is false when the permission query itself fails', async () => {
        const { engine } = setup({ permission: new Error('unsupported') });
        saveSource({ mode: 'device', deviceId: 'mic' });
        await expect(engine.resumeSavedSource()).resolves.toBe(false);
    });

    it('is false when the saved device can no longer be opened', async () => {
        const { engine } = setup({ userStream: new Error('NotFoundError') });
        saveSource({ mode: 'device', deviceId: 'unplugged' });
        await expect(engine.resumeSavedSource()).resolves.toBe(false);
        expect(engine.getIsCapturing()).toBe(false);
    });

    it('shares one attempt between concurrent callers, and allows a new one afterwards', async () => {
        const { engine, media } = setup({ permission: 'denied' });
        saveSource({ mode: 'device', deviceId: 'mic' });

        const first = engine.resumeSavedSource();
        const second = engine.resumeSavedSource();
        expect(second).toBe(first);
        await first;
        expect(media.query).toHaveBeenCalledTimes(1);

        await engine.resumeSavedSource();
        expect(media.query).toHaveBeenCalledTimes(2);
    });
});

describe('replacing and stopping a capture', () => {
    it('stops the old tracks, closes the old context, and hands subscribers straight from the old analyser to the new one', async () => {
        const first = createFakeStream({ audio: true, video: true });
        const media = installFakeMediaDevices({ displayStream: first });
        const web = installFakeWebAudio();
        const engine = new AudioEngine();
        const seen: Array<AnalyserNode | undefined> = [];
        engine.subscribe(() => seen.push(engine.getAnalyser()));

        await engine.startScreenCapture();
        const oldAnalyser = engine.getAnalyser();
        const oldContext = web.contexts[0];
        const oldSource = oldContext.createdSources[0];

        const second = createFakeStream({ audio: true });
        media.getDisplayMedia.mockResolvedValueOnce(second);
        await engine.startScreenCapture();

        expect(first.getAudioTracks()[0].stop).toHaveBeenCalled();
        expect(oldSource.disconnect).toHaveBeenCalled();
        expect(oldContext.close).toHaveBeenCalled();
        expect(engine.getAnalyser()).not.toBe(oldAnalyser);
        expect(web.contexts).toHaveLength(2);
        // First notification: the old analyser appears; second: it goes straight to the new one.
        expect(seen).toHaveLength(2);
        expect(seen.every(analyser => analyser !== undefined)).toBe(true);
    });

    it('stopCapture tears everything down and notifies', async () => {
        const stream = createFakeStream({ audio: true });
        const { engine, web } = setup({ displayStream: stream });
        await engine.startScreenCapture();
        const listener = vi.fn();
        engine.subscribe(listener);

        engine.stopCapture();

        expect(engine.getIsCapturing()).toBe(false);
        expect(engine.getAnalyser()).toBeUndefined();
        expect(stream.getAudioTracks()[0].stop).toHaveBeenCalled();
        expect(web.contexts[0].close).toHaveBeenCalled();
        expect(listener).toHaveBeenCalledTimes(1);
    });

    it('stopCapture is harmless when nothing is captured', () => {
        const { engine } = setup();
        const listener = vi.fn();
        engine.subscribe(listener);
        expect(() => engine.stopCapture()).not.toThrow();
        expect(listener).toHaveBeenCalledTimes(1);
    });

    it('forgetSavedSource clears what is remembered', async () => {
        const { engine } = setup();
        await engine.startDeviceCapture('mic');
        expect(engine.savedSource).toEqual({ mode: 'device', deviceId: 'mic' });
        engine.forgetSavedSource();
        expect(engine.savedSource).toBeUndefined();
    });
});

describe('subscribe', () => {
    it('stops notifying a listener once it unsubscribes', () => {
        const { engine } = setup();
        const listener = vi.fn();
        const unsubscribe = engine.subscribe(listener);
        engine.setNormalize(false);
        unsubscribe();
        engine.setNormalize(true);
        expect(listener).toHaveBeenCalledTimes(1);
    });

    it('logs a listener that throws and still tells the others', () => {
        const { engine } = setup();
        const error = vi.spyOn(console, 'error').mockImplementation(() => { });
        const failure = new Error('boom');
        const healthy = vi.fn();
        engine.subscribe(() => {
            throw failure;
        });
        engine.subscribe(healthy);

        engine.setNormalize(false);

        expect(healthy).toHaveBeenCalledTimes(1);
        expect(error).toHaveBeenCalledWith('AudioEngine listener failed', failure);
    });

    it('tolerates a listener that unsubscribes itself while being notified', () => {
        const { engine } = setup();
        const later = vi.fn();
        const unsubscribe = engine.subscribe(() => unsubscribe());
        engine.subscribe(later);
        engine.setNormalize(false);
        expect(later).toHaveBeenCalledTimes(1);
    });
});

describe('normalize settings', () => {
    it('loads saved settings and the normalize flag on construction', () => {
        saveNormalizeSettings({ ...DEFAULT_NORMALIZE_SETTINGS, maxGain: 3 });
        localStorage.setItem('audioVisualizer.normalize', 'false');
        const { engine } = setup();
        expect(engine.getNormalizeOptions().maxGain).toBe(3);
        expect(engine.getNormalize()).toBe(false);
    });

    it('merges changes, persists them and notifies with a new object each time', () => {
        const { engine } = setup();
        const before = engine.getNormalizeOptions();
        const listener = vi.fn();
        engine.subscribe(listener);

        engine.updateNormalizeOptions({ targetPeak: 0.5 });

        expect(engine.getNormalizeOptions()).not.toBe(before);
        expect(engine.getNormalizeOptions()).toEqual({ ...DEFAULT_NORMALIZE_SETTINGS, targetPeak: 0.5 });
        expect(loadNormalizeSettings().targetPeak).toBe(0.5);
        expect(listener).toHaveBeenCalledTimes(1);
    });

    it('resets to the defaults and forgets the stored values', () => {
        const { engine } = setup();
        engine.updateNormalizeOptions({ targetPeak: 0.5 });
        const listener = vi.fn();
        engine.subscribe(listener);

        engine.resetNormalizeOptions();

        expect(engine.getNormalizeOptions()).toEqual(DEFAULT_NORMALIZE_SETTINGS);
        expect(localStorage.getItem('audioVisualizer.normalizeSettings')).toBeNull();
        expect(listener).toHaveBeenCalledTimes(1);
    });

    it('persists the flag; switching it off while capturing glides the gain back to unity', async () => {
        const { engine, graph } = setup();
        await engine.startScreenCapture();
        const { gain, context } = graph();
        context.currentTime = 7;

        engine.setNormalize(false);

        expect(engine.getNormalize()).toBe(false);
        expect(loadNormalize()).toBe(false);
        expect(gain.gain.setTargetAtTime).toHaveBeenCalledWith(1, 7, 0.05);
    });

    it('switching it off with nothing captured only stores the flag', () => {
        const { engine } = setup();
        expect(() => engine.setNormalize(false)).not.toThrow();
        expect(loadNormalize()).toBe(false);
    });
});

describe('levels', () => {
    it('reads zero when nothing is captured', () => {
        const { engine } = setup();
        expect(engine.getLevel()).toBe(0);
        expect(engine.getOutputLevel()).toBe(0);
    });

    it('measures the raw input and the normalized output on their own meters', async () => {
        const { engine, graph } = setup();
        await engine.startScreenCapture();
        const { meter, outputMeter } = graph();

        meter.setPeak(0.5);
        outputMeter.setPeak(0.25);

        expect(engine.getLevel()).toBeCloseTo(0.5, 2);
        expect(engine.getOutputLevel()).toBeCloseTo(0.25, 2);
    });

    it('reads silence (a centred signal) as zero and takes the largest deviation in either direction', async () => {
        const { engine, graph } = setup();
        await engine.startScreenCapture();
        const { meter } = graph();

        meter.setByteTimeDomainData(128);
        expect(engine.getLevel()).toBe(0);

        const below = new Array(1024).fill(128);
        below[10] = 0;
        meter.setByteTimeDomainData(below);
        expect(engine.getLevel()).toBe(1);
    });
});

describe('automatic gain control', () => {
    async function capture(media: FakeMediaOptions = {}) {
        vi.useFakeTimers();
        const context = setup(media);
        await context.engine.startScreenCapture();
        const nodes = context.graph();
        return { ...context, ...nodes };
    }

    it('raises the gain slowly (release time) when the input is quieter than the target', async () => {
        const { meter, gain } = await capture();
        meter.setPeak(0.5);

        vi.advanceTimersByTime(30);

        // envelope 0.5 -> wanted 0.7 / 0.5.
        expect(gain.gain.setTargetAtTime).toHaveBeenCalledTimes(1);
        const [wanted, , timeConstant] = gain.gain.setTargetAtTime.mock.calls[0];
        expect(wanted).toBeCloseTo(1.4, 1);
        expect(timeConstant).toBe(DEFAULT_NORMALIZE_SETTINGS.releaseTime);
    });

    it('lowers the gain quickly (attack) when the input is louder than the target', async () => {
        const { meter, gain } = await capture();
        meter.setPeak(0.5);
        vi.advanceTimersByTime(30);
        meter.setPeak(0.9);

        vi.advanceTimersByTime(30);

        const [wanted, , timeConstant] = gain.gain.setTargetAtTime.mock.calls[1];
        expect(wanted).toBeLessThan(1);
        expect(timeConstant).toBe(0.02);
    });

    it('schedules the change at the context clock', async () => {
        const { meter, gain, context } = await capture();
        context.currentTime = 12.5;
        meter.setPeak(0.5);
        vi.advanceTimersByTime(30);
        expect(gain.gain.setTargetAtTime.mock.calls[0][1]).toBe(12.5);
    });

    it('treats input below the noise floor as silence and leaves the gain alone', async () => {
        const { gain } = await capture();
        vi.advanceTimersByTime(300);
        expect(gain.gain.setTargetAtTime).not.toHaveBeenCalled();
    });

    it('caps the gain at the maximum', async () => {
        const { meter, gain } = await capture();
        // A tiny but audible signal: 1/128 is above the 0.004 floor and would ask for a gain near 90.
        meter.setPeak(0.01);
        vi.advanceTimersByTime(30);
        expect(gain.gain.setTargetAtTime.mock.calls[0][0]).toBe(DEFAULT_NORMALIZE_SETTINGS.maxGain);
    });

    it('never cuts the gain below the minimum', async () => {
        const { engine, meter, gain } = await capture();
        engine.updateNormalizeOptions({ targetPeak: 0.05 });
        meter.setPeak(0.9);
        vi.advanceTimersByTime(30);
        expect(gain.gain.setTargetAtTime.mock.calls[0][0]).toBe(0.25);
    });

    it('holds the peak and lets it halve every "peak hold" seconds', async () => {
        const { meter, gain } = await capture();
        meter.setPeak(0.5);
        vi.advanceTimersByTime(30);
        meter.setPeak(0);

        // 100 ticks = 3 s = one half-life at the default peak hold: envelope 0.5 -> 0.25.
        vi.advanceTimersByTime(3000);

        const calls = gain.gain.setTargetAtTime.mock.calls;
        expect(calls[calls.length - 1][0]).toBeCloseTo(0.7 / 0.25, 1);
    });

    it('does nothing while normalization is off', async () => {
        const { engine, meter, gain } = await capture();
        engine.setNormalize(false);
        gain.gain.setTargetAtTime.mockClear();
        meter.setPeak(0.5);

        vi.advanceTimersByTime(300);

        expect(gain.gain.setTargetAtTime).not.toHaveBeenCalled();
    });

    it('stops measuring when the capture stops, and starts from a clean envelope on the next one', async () => {
        const { engine, meter, gain, web, media } = await capture();
        meter.setPeak(0.9);
        vi.advanceTimersByTime(30);
        const reads = meter.getByteTimeDomainData.mock.calls.length;

        engine.stopCapture();
        vi.advanceTimersByTime(300);
        expect(meter.getByteTimeDomainData.mock.calls.length).toBe(reads);

        media.getDisplayMedia.mockResolvedValueOnce(createFakeStream({ audio: true }));
        await engine.startScreenCapture();
        const next = web.contexts[1];
        vi.advanceTimersByTime(300);
        // The loud envelope from the first capture must not leak into the new one.
        expect(next.createdGains[0].gain.setTargetAtTime).not.toHaveBeenCalled();
        void gain;
    });
});

describe('latencyInfo and trackInfo', () => {
    it('are empty without a capture', () => {
        const { engine } = setup();
        expect(engine.latencyInfo).toEqual({});
        expect(engine.trackInfo).toBe('');
    });

    it('reports what the context offers and leaves out what it does not', async () => {
        const { engine } = setup();
        await engine.startScreenCapture();

        expect(engine.latencyInfo).toEqual({
            sampleRate: 48000,
            baseLatencyMs: 10,
            outputLatencyMs: undefined,
            captureLatencyMs: undefined,
            analysisWindowMs: 2048 / 48000 * 1000,
        });
    });

    it('includes the output and capture latencies when the browser reports them', async () => {
        const { engine, graph } = setup({ displayStream: createFakeStream({ audio: true, latency: 0.05 }) });
        await engine.startScreenCapture();
        graph().context.outputLatency = 0.02;

        const info = engine.latencyInfo;
        expect(info.outputLatencyMs).toBeCloseTo(20, 5);
        expect(info.captureLatencyMs).toBeCloseTo(50, 5);
    });

    it('copes with a stream that has no audio track', async () => {
        const { engine } = setup({ userStream: createFakeStream({ audio: false }) });
        await engine.startDeviceCapture('silent');
        expect(engine.latencyInfo.captureLatencyMs).toBeUndefined();
        expect(engine.trackInfo).toBe('');
    });

    it('describes the track and its state', async () => {
        const stream = createFakeStream({ audio: true, label: 'Stereo Mix' });
        const { engine } = setup({ displayStream: stream });
        await engine.startScreenCapture();

        expect(engine.trackInfo).toBe('Stereo Mix (live)');
        stream.getAudioTracks()[0].muted = true;
        expect(engine.trackInfo).toBe('Stereo Mix (live, muted)');
    });
});
