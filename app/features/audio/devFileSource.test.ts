// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { installFakeMediaDevices } from '~/test/fakeMedia';
import { installFakeWebAudio, type FakeAudioContext, type FakeWebAudio } from '~/test/fakeWebAudio';
import { AudioEngine } from './audioEngine';
import { getActivePlayback, startFileSource } from './devFileSource';
import { loadSource } from './storage';

let web: FakeWebAudio;
let engine: AudioEngine;

beforeEach(() => {
    localStorage.clear();
    web = installFakeWebAudio();
    installFakeMediaDevices();
    engine = new AudioEngine();
    // Stop whatever an earlier spec left playing so the module-level active playback starts clean.
    engine.stopCapture();
});

const data = new ArrayBuffer(8);
const lastContext = (): FakeAudioContext => web.contexts.at(-1)!;

describe('startFileSource', () => {
    it('plays the decoded buffer once, without looping, and does not remember the source', async () => {
        const playback = await startFileSource(engine, data, { label: 'song.mp3' });

        const [node] = lastContext().createdBufferSources;
        expect(node.loop).toBe(false);
        expect(node.start).toHaveBeenCalledWith(0, 0);
        expect(playback.label).toBe('song.mp3');
        expect(playback.duration).toBe(10);
        expect(playback.ended).toBe(false);
        expect(getActivePlayback()).toBe(playback);
        expect(engine.getIsCapturing()).toBe(true);
        expect(engine.trackInfo).toBe('song.mp3');
        expect(loadSource()).toBeUndefined();
    });

    it('starts at the requested offset and uses a default label', async () => {
        const playback = await startFileSource(engine, data, { offset: 4 });
        expect(lastContext().createdBufferSources[0].start).toHaveBeenCalledWith(0, 4);
        expect(playback.label).toBe('audio file');
    });

    it('rejects with one clear line when decoding fails and keeps the old source', async () => {
        const first = await startFileSource(engine, data);
        web.decodeError = new Error('EncodingError');

        await expect(startFileSource(engine, data, { label: 'bad.bin' })).rejects.toThrow(
            "Couldn't play bad.bin: unsupported or corrupt audio file.",
        );
        expect(lastContext().close).toHaveBeenCalled();
        expect(getActivePlayback()).toBe(first);
        expect(engine.getIsCapturing()).toBe(true);
    });

    it('is audible by default, through the bus and not the engine gain, and inaudible on request', async () => {
        await startFileSource(engine, data);
        const loud = lastContext();
        const bus = loud.createdGains[0];
        expect(bus.connect).toHaveBeenCalledWith(loud.destination);
        expect(engine.getInputNode()).toBe(bus);

        await startFileSource(engine, data, { audible: false });
        const quiet = lastContext();
        expect(quiet.createdGains[0].connect).not.toHaveBeenCalledWith(quiet.destination);
    });

    it('tracks the position from the context clock and clamps it', async () => {
        const playback = await startFileSource(engine, data, { offset: 2 });
        const context = lastContext();
        context.currentTime = 3;
        expect(playback.position()).toBe(5);
        context.currentTime = 100;
        expect(playback.position()).toBe(10);
    });

    it('stops the engine when the track ends while it is the active source', async () => {
        const playback = await startFileSource(engine, data);
        lastContext().createdBufferSources[0].finish();

        expect(playback.ended).toBe(true);
        expect(playback.position()).toBe(10);
        expect(engine.getIsCapturing()).toBe(false);
        expect(getActivePlayback()).toBeUndefined();
    });

    it('does not stop the engine when an ended track is no longer the active source', async () => {
        await startFileSource(engine, data);
        const oldNode = lastContext().createdBufferSources[0];
        // Simulate a browser delivering `onended` late, after another source took over.
        const lateEnded = oldNode.onended;
        await startFileSource(engine, data);
        const stopCapture = vi.spyOn(engine, 'stopCapture');

        lateEnded?.();

        expect(stopCapture).not.toHaveBeenCalled();
        expect(engine.getIsCapturing()).toBe(true);
    });

    it('seeks by replacing the buffer node and ignoring the old node ending', async () => {
        const playback = await startFileSource(engine, data);
        const context = lastContext();
        const [first] = context.createdBufferSources;
        context.currentTime = 1;

        playback.seek(6);

        expect(context.createdBufferSources).toHaveLength(2);
        expect(first.stop).toHaveBeenCalled();
        expect(first.onended).toBeNull();
        expect(context.createdBufferSources[1].start).toHaveBeenCalledWith(0, 6);
        expect(playback.position()).toBe(6);
        context.currentTime = 2;
        expect(playback.position()).toBe(7);

        playback.seek(-5);
        expect(context.createdBufferSources[2].start).toHaveBeenCalledWith(0, 0);
        playback.seek(99);
        expect(context.createdBufferSources[3].start).toHaveBeenCalledWith(0, 10);
    });

    it('clears the active playback when stopped and ignores seeks afterward', async () => {
        const playback = await startFileSource(engine, data);
        const context = lastContext();

        engine.stopCapture();
        expect(getActivePlayback()).toBeUndefined();
        expect(context.createdBufferSources[0].stop).toHaveBeenCalled();

        playback.seek(3);
        expect(context.createdBufferSources).toHaveLength(1);
    });

    it('clears the active playback when another source replaces it', async () => {
        await startFileSource(engine, data);
        await engine.startSource((context) => ({
            node: context.createGain(),
            stop: () => {},
        }));
        expect(getActivePlayback()).toBeUndefined();
    });
});
