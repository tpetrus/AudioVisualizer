import { getActivePlayback } from './devFileSource';

// DEV only (the debug harness's telemetry columns). A page-clock mark on the recording's `t` clock, the same one the
// row's `t` is read from: the file playback's position when a track is playing, else the audio context's time
// (`contextTime`, undefined when there is no source). A mark made before the track started is negative, which is how a
// recording shows that a scene was already built, or its model parsed, at track start.
//
// `performance.now()` (`markMs`, in ms) is the one clock both marks can use: the audio context may not exist yet when a
// scene is built. Each row subtracts the mark's age, so the two clocks agree to a frame. NaN while the mark is unset
// (NaN) or there is no clock to put it on.
export function onRecordingClock(markMs: number, contextTime: number | undefined): number {
    const playback = getActivePlayback();
    const now = playback ? playback.position() : contextTime;
    if (now === undefined || Number.isNaN(markMs)) return NaN;
    return now - (performance.now() - markMs) / 1000;
}
