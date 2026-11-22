import type { BeatsPerBar } from '~/features/rhythm/types';
import type { FEATURE_ONSET_BANDS, HUB_BANDS } from '~/features/rhythm/rhythmConfig';

// Contract C5 (docs/plans/audio-engine-alignment/contracts.md) and, for `gateBass`, C1
// (docs/plans/hub-regressions/contracts.md). Frozen by the orchestrator: a change is an escalation.

// Names of the hub's energy bands, in the order of `AudioHubSnapshot.bands`.
export type HubBand = (typeof HUB_BANDS)[number];
// Names of the onset kinds, the keys of `AudioHubSnapshot.onsets`.
export type HubOnsetBand = (typeof FEATURE_ONSET_BANDS)[number];

// The newest onset of one kind at or before the snapshot's time. Events stamped later than that time are held back
// until a later update reaches them, so a positive sync offset delays onsets like it delays the beat.
export interface HubOnset {
    // AudioContext seconds of the newest onset at or before `time`; -Infinity before the first one.
    lastTime: number;
    // 0..1 strength of that onset as the worklet reported it (not decayed; decay with `sinceSeconds`). 0 before the first.
    strength: number;
    // time - lastTime, never negative; Infinity before the first onset.
    sinceSeconds: number;
    // Onsets of this kind that have reached `time`. Only ever increases, across source changes too (the counters pattern).
    count: number;
}

export interface HubBeat {
    // 0..1 position in the beat and in the bar, as RhythmState.beatPhase / barPhase after updatePhase(time).
    phase: number | undefined;
    barPhase: number | undefined;
    // Held tempo in BPM, 0 while unknown.
    tempo: number;
    // 0..1 tempo confidence.
    confidence: number;
    // True when the tracker has a tempo and a beat position: tempo > 0 and phase !== undefined.
    locked: boolean;
    // Additions to the plan's wording, so visualizers need not read the tracker as well:
    beatsPerBar: BeatsPerBar | undefined;
    // True when a downbeat is worth showing: beatsPerBar !== undefined and meterConfidence >= METER_VISUAL_CONFIDENCE.
    barLocked: boolean;
    // RhythmState.beatCount / downbeatCount after updatePhase(time).
    beatCount: number;
    downbeatCount: number;
}

export interface HubSection {
    // RhythmState.songChangeCount.
    changeCount: number;
    // The snapshot time at which the hub first saw the current changeCount; -Infinity before the first change.
    lastChangeTime: number;
}

// Contract C1 of hub-regressions (S4): the bass for consumers that compare it with a threshold (the dancing character's
// gate, the cubes' bump, later bass-ink). Neither value is normalized, so a level reads the same however loud the last
// few seconds were. 0 before the first update and after a reset.
export interface HubGateBass {
    // BassPulse's feature, read at each update: the linear RMS of the newest GATE_BASS_WINDOW samples after the 120 Hz,
    // 24 dB/octave lowpass (GateBassTap), read from the audio graph rather than from a frame, so it is as new as the
    // audio. Unlike `bands`, `onsets`, `lowEnd` and `beat`, it is not shifted by the user's sync offset: it is the
    // audio of the moment of the update. It reads 0 when the tracker has no source (the tap is then disconnected). A
    // level, not an envelope: run a fast and a slow follower over it to find bumps.
    pulse: number;
    // The louder of the `sub` and `kick` band energies of the frame `bands` comes from, before the hub scales them, in
    // FeatureBatch.bandEnergy units (mean of log(1 + MAGNITUDE_LOG_GAIN * magnitude)).
    lowEnd: number;
}

// One preallocated object per hub, updated in place by `update`. Hold on to it; never copy it into React state.
export interface AudioHubSnapshot {
    // Render time (AudioContext seconds) this snapshot describes; 0 before the first update.
    time: number;
    // HUB_BAND_COUNT values in HUB_BANDS order, 0..1: the band's energy from the newest frame at or before `time`
    // (the oldest held frame if `time` is earlier than all of them), scaled so 1 is the band's loudest of the last few
    // seconds. Silence reads 0; before the first frame and after a reset all are 0; with no source the last values stay.
    bands: Float32Array;
    // Keyed by FEATURE_ONSET_BANDS. Valid without a tempo lock. `strength` is on one of two scales, and they are not
    // normalized to each other: a phase onset's (a re-struck low note, reported as bass or kick) is relative to the phase
    // function's own decaying peak, a level onset's (any kind) to the decaying peak of its onset band's earlier
    // strengths. So the kick and bass kinds each mix both scales, and the same strength from two kinds does not mean the
    // same loudness. Gate each kind on its own values.
    onsets: Readonly<Record<HubOnsetBand, HubOnset>>;
    beat: HubBeat;
    section: HubSection;
    // Written in place each update, never replaced.
    gateBass: Readonly<HubGateBass>;
}

// The hub as visualizers see it.
export interface AudioHubReader {
    readonly snapshot: AudioHubSnapshot;
    // Brings `snapshot` up to `now` (AudioContext seconds). Without an argument it reads at the tracker's render time
    // (audio clock minus display delay and user sync offset, contract C6); with no bound source it leaves the snapshot
    // unchanged. Calling it again with the same time does nothing, so every consumer may call it once per frame. It
    // allocates nothing.
    update(now?: number): void;
}
