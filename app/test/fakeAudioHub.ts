import { vi } from 'vitest';
import { FEATURE_ONSET_BANDS, HUB_BAND_COUNT } from '~/features/rhythm/rhythmConfig';
import type { AudioHubReader, AudioHubSnapshot, HubOnset, HubOnsetBand } from '~/features/audio/hub/types';

// A stand-in for the audio hub, for specs of visualizers that read `useAudioHub()`. It does no analysis: the spec
// writes the values the scene should see straight into `snapshot` (or with the helpers) and `update` is a spy.
//
//   const hub = new FakeAudioHub();
//   hub.setBands([1, 0.5, 0, 0, 0, 0]);
//   hub.fireOnset('kick', { time: 1, strength: 0.8 });
//   render(<AudioHubContext.Provider value={hub}>...</AudioHubContext.Provider>);

export class FakeAudioHub implements AudioHubReader {
    readonly snapshot: AudioHubSnapshot;
    readonly update = vi.fn((now?: number) => {
        if (now !== undefined) {
            this.snapshot.time = now;
        }
    });

    constructor() {
        const onsets = {} as Record<HubOnsetBand, HubOnset>;
        for (const band of FEATURE_ONSET_BANDS) {
            onsets[band] = { lastTime: -Infinity, strength: 0, sinceSeconds: Infinity, count: 0 };
        }
        this.snapshot = {
            time: 0,
            bands: new Float32Array(HUB_BAND_COUNT),
            onsets,
            beat: {
                phase: undefined,
                barPhase: undefined,
                tempo: 0,
                confidence: 0,
                locked: false,
                beatsPerBar: undefined,
                barLocked: false,
                beatCount: 0,
                downbeatCount: 0,
            },
            section: { changeCount: 0, lastChangeTime: -Infinity },
        };
    }

    // Sets the band energies; missing values read 0.
    setBands(values: ArrayLike<number>): void {
        for (let b = 0; b < HUB_BAND_COUNT; b++) {
            this.snapshot.bands[b] = values[b] ?? 0;
        }
    }

    // Records one onset the way the real hub does when it reaches it: the counter rises and the age is measured from
    // the snapshot's current time.
    fireOnset(kind: HubOnsetBand, { time = this.snapshot.time, strength = 1 } = {}): void {
        const onset = this.snapshot.onsets[kind];
        onset.lastTime = time;
        onset.strength = strength;
        onset.count++;
        onset.sinceSeconds = Math.max(0, this.snapshot.time - time);
    }
}
