import { vi } from 'vitest';
import { createFakeStream, type FakeMediaStream } from './fakeWebAudio';

// Stubs `navigator.mediaDevices` and `navigator.permissions`, the browser APIs AudioEngine uses to ask for audio.
// jsdom has neither. Undone by `vi.unstubAllGlobals()` (done in setup.ts after each test).
//
//   const media = installFakeMediaDevices({ permission: 'denied' });
//   await engine.startScreenCapture();
//   expect(media.getDisplayMedia).toHaveBeenCalledWith({ audio: true, video: true });
//
// Any stream option may be an `Error`, which makes that call reject (e.g. the user cancelling the share dialog).

export function createFakeDevice(overrides: Partial<MediaDeviceInfo> = {}): MediaDeviceInfo {
    return {
        deviceId: 'device-1',
        groupId: 'group-1',
        kind: 'audioinput',
        label: 'Fake Microphone',
        toJSON: () => ({}),
        ...overrides,
    } as MediaDeviceInfo;
}

export interface FakeMediaOptions {
    // Returned by getDisplayMedia (screen/tab capture). Default: audio + video, as when the user ticks "share audio".
    displayStream?: FakeMediaStream | Error;
    // Returned by getUserMedia (input device capture, and the permission probe in getInputDevices). Default: audio only.
    userStream?: FakeMediaStream | Error;
    // Returned by enumerateDevices. Default: none.
    devices?: MediaDeviceInfo[];
    // What `permissions.query({ name: 'microphone' })` reports; an Error makes the query reject. Default: 'granted'.
    permission?: PermissionState | Error;
}

export function installFakeMediaDevices(options: FakeMediaOptions = {}) {
    const {
        displayStream = createFakeStream({ audio: true, video: true }),
        userStream = createFakeStream({ audio: true }),
        devices = [],
        permission = 'granted',
    } = options;

    const settle = <T,>(value: T | Error): Promise<T> => value instanceof Error ? Promise.reject(value) : Promise.resolve(value);

    const getDisplayMedia = vi.fn(async (_constraints?: unknown) => settle(displayStream));
    const getUserMedia = vi.fn(async (_constraints?: unknown) => settle(userStream));
    const enumerateDevices = vi.fn(async () => devices);
    const query = vi.fn(async (_descriptor?: unknown) =>
        permission instanceof Error ? Promise.reject(permission) : { state: permission });

    const mediaDevices = { getDisplayMedia, getUserMedia, enumerateDevices };
    const permissions = { query };

    // A child of the real navigator (not a copy), so everything else on it (userAgent, ...) keeps working.
    vi.stubGlobal('navigator', Object.create(navigator, {
        mediaDevices: { value: mediaDevices, configurable: true },
        permissions: { value: permissions, configurable: true },
    }));

    return { mediaDevices, permissions, getDisplayMedia, getUserMedia, enumerateDevices, query };
}
