import { TEST_SAMPLE_RATE, concat, renderDecoratedTrack, renderTrack } from '../../../app/features/rhythm/testSignals';
import type { ScenarioMeasures } from '../types';
import { replayPcm } from './replay';

// The two AC9 cases, on constructed audio, run through the same replay as a real track.

export const SCENARIO_DOTTED_SONG_CHANGE = 'scenario:dotted-100-150';
export const SCENARIO_DOTTED_PASSAGE = 'scenario:dotted-passage';

// A real song change whose new tempo is the dotted rival of the old one: 100 bpm for a while, then 150 bpm (3/2 of it)
// with a new sound, joined with no gap like a gapless album. Both are click tracks with a kick on the downbeat. Nothing
// in the audio is silent, so every boundary the analyzer raises here is a soft one.
export function dottedSongChangePcm(sampleRate: number = TEST_SAMPLE_RATE): Float32Array {
    const before = renderTrack({ sampleRate, seconds: 24, bpm: 100, beatsPerBar: 4 });
    const after = renderTrack({ sampleRate, seconds: 36, bpm: 150, beatsPerBar: 4, clickHz: 2200 });
    return concat(before.pcm, after.pcm);
}

// A dotted passage inside one song: a steady 120 bpm pulse with a kick on every beat, and in the second half of every
// 16 beats added notes every 3/4 of a beat, the pulse that dotted notes make against the beat. The old pulse is still
// there throughout, and the song does not change, so it is not a boundary and the tracker should not raise one.
export function dottedPassagePcm(sampleRate: number = TEST_SAMPLE_RATE): Float32Array {
    return renderDecoratedTrack({
        sampleRate,
        seconds: 60,
        bpm: 120,
        decorationOffsets: [0.75, 1.5, 2.25],
        phraseLength: 8,
        phraseBeats: 16,
    }).pcm;
}

export function measureScenarios(): ScenarioMeasures[] {
    const cases: { id: string; pcm: Float32Array }[] = [
        { id: SCENARIO_DOTTED_SONG_CHANGE, pcm: dottedSongChangePcm() },
        { id: SCENARIO_DOTTED_PASSAGE, pcm: dottedPassagePcm() },
    ];
    return cases.map(({ id, pcm }) => {
        const replay = replayPcm(pcm, TEST_SAMPLE_RATE);
        return { id, songChanges: replay.songChangeCount, softBoundaries: replay.softBoundaries };
    });
}
