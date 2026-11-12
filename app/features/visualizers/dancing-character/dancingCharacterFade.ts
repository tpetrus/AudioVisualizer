import { DANCE_FADE_BEATS, DANCE_FADE_MAX_SECONDS, MIN_TIME_SCALE, NATIVE_BPM } from './dancingCharacterConfig';

// Wall-clock seconds a cross-fade between two dances takes at the given clip speed: one beat of clip time, so the
// hand-over spans one step of the music at any tempo, and never longer than DANCE_FADE_MAX_SECONDS, so a slow dance
// still changes promptly. (The beat is the clip's own, 60 / NATIVE_BPM seconds, scaled by the speed it plays at.)
export function fadeSeconds(timeScale: number): number {
    const beatSeconds = (DANCE_FADE_BEATS * 60) / NATIVE_BPM;
    return Math.min(DANCE_FADE_MAX_SECONDS, beatSeconds / Math.max(timeScale, MIN_TIME_SCALE));
}
