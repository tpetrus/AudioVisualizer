// @vitest-environment jsdom
import { renderHook } from '@testing-library/react';
import { PerspectiveCamera } from 'three';
import { createElement, type ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import styles from '~/components/ControlPanel/ControlPanel.module.css';
import { AudioEngine } from '~/features/audio/audioEngine';
import { useAudio } from '~/features/audio/audioEngineContext';
import { RhythmTracker } from '~/features/rhythm/rhythmTracker';
import { useRhythm } from '~/features/rhythm/rhythmTrackerContext';
import { useThreeScene } from '~/hooks/useThreeScene';
import { FakeAudioEngine, FakeRhythmTracker } from './fakeEngines';
import { createFakeDevice, installFakeMediaDevices } from './fakeMedia';
import { installFakeResizeObserver } from './fakeResizeObserver';
import { FakeRenderer } from './fakeThree';
import { asWebAudio, createFakeStream, FakeAnalyserNode, FakeAudioContext, installFakeWebAudio } from './fakeWebAudio';
import { renderHookWithProviders, renderWithProviders } from './renderWithProviders';

// The exact pattern documented at the top of fakeThree.ts.
vi.mock('three', async (importOriginal) => {
    const { threeFakes } = await import('~/test/fakeThree');
    return { ...(await importOriginal<typeof import('three')>()), ...threeFakes };
});

describe('test infrastructure', () => {
    it('runs a jsdom spec and resolves CSS module imports', () => {
        expect(document.createElement('canvas')).toBeInstanceOf(HTMLCanvasElement);
        expect(typeof styles).toBe('object');
        expect(document.body).toBeInTheDocument();
    });

    it('fakeWebAudio and fakeMedia drive the real AudioEngine', async () => {
        const web = installFakeWebAudio();
        const media = installFakeMediaDevices({
            userStream: createFakeStream({ audio: true, latency: 0.02 }),
            devices: [createFakeDevice(), createFakeDevice({ deviceId: 'communications' })],
        });
        const engine = new AudioEngine();

        expect(await engine.getInputDevices()).toHaveLength(1);
        await engine.startDeviceCapture('device-1');

        expect(media.getUserMedia).toHaveBeenCalledTimes(2);
        expect(engine.getIsCapturing()).toBe(true);
        expect(web.contexts).toHaveLength(1);
        expect(web.contexts[0].resume).toHaveBeenCalled();
        expect(web.contexts[0].createdAnalysers).toHaveLength(3);
        expect(engine.latencyInfo.captureLatencyMs).toBeCloseTo(20);

        // The meter reads silence until a spec feeds it data, then the peak.
        const meter = web.contexts[0].createdAnalysers[1];
        expect(engine.getLevel()).toBe(0);
        meter.setPeak(0.5);
        expect(engine.getLevel()).toBeCloseTo(0.5);

        engine.stopCapture();
        expect(web.contexts[0].close).toHaveBeenCalled();
        expect(engine.getIsCapturing()).toBe(false);
    });

    it('fake permissions and display media can reject', async () => {
        installFakeWebAudio();
        installFakeMediaDevices({ displayStream: new Error('cancelled'), permission: 'denied' });
        const engine = new AudioEngine();

        await expect(engine.startScreenCapture()).rejects.toThrow('cancelled');
        expect(await navigator.permissions.query({ name: 'microphone' as PermissionName })).toEqual({ state: 'denied' });
    });

    it('FakeAnalyserNode serves frequency, time-domain and float data', () => {
        const analyser = new FakeAnalyserNode();
        analyser.setByteFrequencyData([1, 2, 3]);
        const bytes = new Uint8Array(4);
        analyser.getByteFrequencyData(bytes);
        expect([...bytes]).toEqual([1, 2, 3, 0]);

        analyser.setFloatTimeDomainData(0.25);
        const floats = new Float32Array(2);
        analyser.getFloatTimeDomainData(floats);
        expect([...floats]).toEqual([0.25, 0.25]);
        expect(analyser.frequencyBinCount).toBe(1024);
    });

    it('the worklet node posts real messages through its MessageChannel', async () => {
        const web = installFakeWebAudio();
        const node = new AudioWorkletNode(new AudioContext(), 'processor');
        const received = vi.fn();
        node.port.addEventListener('message', received);
        node.port.start();

        web.workletNodes[0].processorPort.postMessage({ count: 1 });
        await vi.waitFor(() => expect(received).toHaveBeenCalledTimes(1));
        expect(received.mock.calls[0][0].data).toEqual({ count: 1 });
        node.port.close();
        web.workletNodes[0].processorPort.close();
    });

    it('the real RhythmTracker binds to a fake analyser and loads the worklet module', async () => {
        const web = installFakeWebAudio();
        const engine = new FakeAudioEngine();
        const tracker = new RhythmTracker();
        const context = new FakeAudioContext();
        const analyser = new FakeAnalyserNode(context);
        engine.setAnalyser(asWebAudio<AnalyserNode>(analyser));

        tracker.start(asWebAudio<AudioEngine>(engine));
        await vi.waitFor(() => expect(web.workletNodes).toHaveLength(1));
        expect(context.audioWorklet.addModule).toHaveBeenCalledTimes(1);
        expect(analyser.connect).toHaveBeenCalledWith(web.workletNodes[0]);

        tracker.dispose();
        expect(analyser.disconnect).toHaveBeenCalled();
    });

    it('fakeThree and fakeResizeObserver let useThreeScene be driven frame by frame', () => {
        const resizes = installFakeResizeObserver();
        const container = document.createElement('div');
        Object.defineProperty(container, 'clientWidth', { value: 400 });
        Object.defineProperty(container, 'clientHeight', { value: 300 });
        const update = vi.fn();
        const resize = vi.fn();
        const camera = new PerspectiveCamera();

        const { unmount } = renderHook(() => useThreeScene({ current: container }, () => ({ camera, update, resize })));

        const renderer = FakeRenderer.last;
        expect(container.querySelector('canvas')).toBe(renderer.domElement);
        expect(renderer.setSize).toHaveBeenCalledWith(400, 300, false);

        renderer.renderFrame(10);
        renderer.renderFrame(26);
        expect(update.mock.calls).toEqual([[10, 0], [26, 16]]);
        expect(renderer.render).toHaveBeenCalledTimes(2);

        resizes.resize(800, 400);
        expect(renderer.setSize).toHaveBeenLastCalledWith(800, 400, false);
        expect(resize).toHaveBeenCalledWith({ width: 800, height: 400 });
        expect(camera.aspect).toBe(2);

        unmount();
        expect(renderer.dispose).toHaveBeenCalledTimes(1);
        expect(renderer.forceContextLoss).toHaveBeenCalledTimes(1);
        expect(renderer.animationLoop).toBeNull();
        expect(() => renderer.renderFrame(0)).toThrow();
        expect(container.querySelector('canvas')).toBeNull();
    });

    it('mocks three with a controllable renderer', async () => {
        const THREE = await import('three');
        expect(THREE.WebGLRenderer).toBe(FakeRenderer);
        // Real classes remain real.
        expect(new THREE.Scene().isScene).toBe(true);
    });

    it('renderWithProviders supplies the fake engine and tracker', () => {
        const engine = new FakeAudioEngine();
        const tracker = new FakeRhythmTracker();
        const seen: unknown[] = [];
        function Probe(): ReactNode {
            seen.push(useAudio(), useRhythm());
            return createElement('p', null, 'probe');
        }

        const { getByText, user } = renderWithProviders(createElement(Probe), { engine, tracker });
        expect(getByText('probe')).toBeInTheDocument();
        expect(seen).toEqual([engine, tracker]);
        expect(tracker.start).toHaveBeenCalledWith(engine);
        expect(user).toBeDefined();

        const hook = renderHookWithProviders(() => useAudio());
        expect(hook.result.current).toBe(hook.engine);
    });
});
