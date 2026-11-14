# Audio alignment: frozen contracts

Frozen by the orchestrator before any worker started. Source: `audio-engine-alignment.plan.json` (r1, hash
`0af981b67fb281de`), `handoff.verified_diamond.freeze_first`. Workers build against these and do not change them; a
needed change is an escalation to the orchestrator.

## C1 BeatSidecar and C2 EvalReport

The types are the contract: `app/features/rhythm/eval/evalTypes.ts`.

- A sidecar is `<track without extension>.beats.json` next to the audio (`lonley.wav` and `lonley.beats.json`). The
  harness copies it to `<outDir>/track.beats.json`, as it already does with `track.bpm`.
- Audio stays local and gitignored. Synthetic sidecars are committed under `scripts/ground-truth/sidecars/`, and a spec
  checks that the generator still reproduces them.
- Definitions of each figure (what the beat error is measured from, what counts as locked) are the comments on the
  fields. Onset matching is one to one: each ground-truth onset matches at most one detection and the reverse, within
  the tolerance.
- Additions to the plan's wording, all additive: `tapNoiseFloorMs` on the sidecar and the report (AC1 needs it beside
  every tapped figure), `bias` in the beat error (signed, to tell latency from scatter), and `onsets` as one entry per
  tolerance (AC1 reports both 20 ms and 50 ms).
- Until S4 adds kick, bass, snare and highs onset events, the pipeline has only the three-band flux (kick, mid, high).
  The baseline maps kick to `kick`, mid to `snare`, high to `highs`, picks peaks in the evaluation code (not in app
  code), and leaves `bass` out of the report.

## C4 Analyser request

```ts
// app/features/audio/types.ts
export interface AnalyserSettings {
    fftSize: number;
    smoothingTimeConstant: number;
    minDecibels: number;
    maxDecibels: number;
}
// The engine tap's fixed settings.
export const ENGINE_TAP_SETTINGS: Readonly<AnalyserSettings> = {
    fftSize: 2048,
    smoothingTimeConstant: 0,
    minDecibels: -100,
    maxDecibels: -30,
};
export interface OwnedAnalyser {
    // The consumer's node for the current source, or undefined while nothing is captured. A new source gives a new
    // node (new AudioContext); the engine notifies `subscribe` listeners when that happens.
    getNode: () => AnalyserNode | undefined;
    // Disconnects the node and stops the engine recreating it. Safe to call twice.
    release: () => void;
}

// AudioEngine
getAnalyser(): AnalyserNode | undefined;                 // unchanged signature: the engine-owned tap
acquireAnalyser(settings: AnalyserSettings): OwnedAnalyser;

// useAudioState.ts
useAnalyser(): AnalyserNode | undefined;                             // the tap
useAnalyser(options: AnalyserSettings): AnalyserNode | undefined;    // a node owned by the calling component
```

Rules:

1. The tap is created with `ENGINE_TAP_SETTINGS` for every graph. Assigning `fftSize`, `smoothingTimeConstant`,
   `minDecibels` or `maxDecibels` on the tap from outside the engine throws a `TypeError` that names
   `useAnalyser(options)`. The tracker, the hub (later), telemetry and the source panel attach to the tap or read it.
   Connecting further nodes to the tap's output stays allowed (an AnalyserNode passes audio through unchanged).
2. An owned node is fed from the same point as the tap (the gain node's output, after normalization) and carries
   exactly the settings its owner declared. Its owner may assign new settings on it at any time.
3. On a source change the engine builds each live owned node again in the new AudioContext with that node's current
   settings (not the originally declared ones), then notifies. On `release` and on teardown the node is disconnected.
4. `useAnalyser(options)` acquires in an effect and releases in its cleanup, so a StrictMode double mount leaves exactly
   one live node. It compares option values, not object identity: a new object with equal values does not recreate the
   node; changed values are assigned to the existing node.
5. No consumer can reach another consumer's node through the engine.
6. Every code path that sets analyser properties on a node it did not create moves to an owned node. Code that already
   creates its own analyser downstream of the tap (BassPulse, trio-color-wave's sheets, devTelemetry) conforms and is
   confirmed, not rewritten.

## C3 WorkletFeatureMessage, C5 AudioHubSnapshot, C6 TimingModel

Frozen at the wording in the plan (`freeze_first`). No task in the first session (S1, S9, S3, S2, S10) implements or
depends on them. Their type-level definitions are written by the orchestrator at the start of the session that runs S4,
after S2 has answered Q2 (tap before or after the automatic gain control).

## C3 WorkletFeatureMessage (frozen at the start of the S4 session)

S2 answered Q2: the tap and the worklet stay after the gain control. The types are the contract:
`FeatureBatch` and `FEATURE_MESSAGE_VERSION` in `app/features/rhythm/types.ts`, and `HUB_BANDS`, `HUB_BAND_EDGES_HZ`,
`FEATURE_ONSET_BANDS` and `ONSET_LOOKAHEAD_FRAMES` in `app/features/rhythm/rhythmConfig.ts`.

- `FeatureBatch` extends `FrameBatch`, so the packed frame and `FRAME_STRIDE` are unchanged (D13) and the tracker keeps
  reading `time0`, `count` and `frames`. The replay fixtures hold the tracker's combined onset envelope, which depends
  only on the packed frame, so they stay valid; their spec proves it.
- Onset events are detected in the worklet, causally, with at most `ONSET_LOOKAHEAD_FRAMES` frames of look-ahead, and
  stamped with the analysis-window centre of the onset frame, not the time they were decided. The detector is a pure
  module (`bandOnsets.ts`) that allocates only in its constructor, so the offline evaluation runs exactly the detector the
  worklet runs. It does not run the worklet's batching and reset; the worklet spec covers those.
- The band names describe frequency ranges, not instruments. `snare` is an onset in the mid band (800 to 4000 Hz),
  which vocals and guitars also reach, and the kick and bass split is a centroid test at the bass band's lower edge
  (130 Hz) that matches the synthetic voices, not real bass notes, whose fundamentals often sit below it.
- Precision on real music is not measured: real tracks have no onset ground truth, and the synthetic F scores come
  from the same tracks the thresholds were set on. On the six local debug tracks the detector emits 2 to 9 low-end
  events and up to 8 snare events per tapped beat. Consumers must gate on `onsetStrength` and must not read the events
  as one per drum hit until a later slice measures and fixes that.
- Up to `ONSET_LOOKAHEAD_FRAMES` onset candidates still waiting for their look-ahead are dropped when the worklet
  resets after skipped blocks, and at the end of the input; there is no flush.
- `bandEnergy` is in the packed frame's energy units and not normalized; normalizing is the hub's job (C5, S7).
- `BATCH_FRAMES` stays 8 in S4. S5 measures and cuts it.
- C5 and C6 are written at the start of the slices that implement them (S7 and S5).

## C6 TimingModel (frozen at the start of the S5 session)

The module is `app/features/audio/timingModel.ts`: pure functions and constants, no browser API, no import from
`app/features/rhythm/`. Times are seconds unless the name ends in `Ms`.

```ts
// Where the audio comes from, as far as delay is concerned. 'file' is the dev file source, the only one that plays
// through the context's destination.
export type CaptureKind = 'screen' | 'device' | 'file';

// Deliberate display delay (look-ahead experiment, D11). 0 unless the experiment is adopted; never a user setting.
export const DISPLAY_DELAY_MS = 0;

// Range and step of the user sync offset. Positive makes beat-driven visuals later, negative earlier.
export const SYNC_OFFSET_MIN_MS = -200;
export const SYNC_OFFSET_MAX_MS = 200;
export const SYNC_OFFSET_STEP_MS = 5;
export const DEFAULT_SYNC_OFFSET_MS = 0;

// Estimated delay from the listener hearing a sound to its samples reaching the AudioContext, per source kind. 0 means
// not measured; the findings document says where each figure comes from. Nothing is subtracted for it automatically:
// the user sync offset is the correction.
export const CAPTURE_DELAY_MS: Readonly<Record<CaptureKind, number>>;

export interface TimingSettings {
    displayDelayMs: number;
    userSyncOffsetMs: number;
}

// The audio-clock time a render loop should read time-stamped values at.
// renderTime = audioNow - (displayDelayMs + userSyncOffsetMs) / 1000
export function renderTime(audioNow: number, settings: TimingSettings): number;

// A stored or typed value as a valid offset: non-numbers and non-finite values give DEFAULT_SYNC_OFFSET_MS, others are
// clamped to the range and rounded to the step.
export function clampSyncOffsetMs(value: unknown): number;

export interface FeatureDelayInput {
    sampleRate: number;
    fftSize: number;
    hopSeconds: number;
    batchFrames: number;
    captureKind: CaptureKind;
}

// Upper bound on how long after a sound a feature frame describing it reaches the main thread:
// half the analysis window + one hop + one batch (batchFrames * hopSeconds) + CAPTURE_DELAY_MS[captureKind] / 1000.
export function featureDelaySeconds(input: FeatureDelayInput): number;
```

Rules:

1. The user sync offset is one audio-wide setting owned by `AudioEngine` (`getSyncOffsetMs()` as an arrow property for
   `useSyncExternalStore`, `setSyncOffsetMs(value)` which clamps, saves through `storage.ts` and notifies only when the
   value changed). It is loaded once in the constructor and survives source changes. Storage key
   `audioVisualizer.syncOffsetMs`; a corrupt stored value loads as 0.
2. `RhythmTracker.updatePhase()` without an argument, and the tracker's own call after each worklet message, read at
   `renderTime(context.currentTime, { displayDelayMs: DISPLAY_DELAY_MS, userSyncOffsetMs: engine.getSyncOffsetMs() })`.
   `updatePhase(now)` with an explicit time uses that time unchanged (the offline evaluation and specs pass one).
   `RhythmState` is unchanged. `RhythmAnalyzer.updatePhase` extrapolates backwards by up to one beat when the time is
   before the newest declared beat (amended after the S5 review: a positive offset above the analysis lag otherwise
   held the phase at 0); for a time at or after that beat it is unchanged.
3. In S5 the offset moves only what `updatePhase` extrapolates: beat and bar phase, `nextBeatTime` and the beat
   counters. Peak-held onset values (`state.bandOnsets`) and direct analyser reads cannot be moved earlier and are not
   delayed. Delaying the stamped onset events is the hub's job (C5, S7).
4. The control is a range input in the active source panel, labelled so that the direction is clear (earlier or
   later), showing the value in ms, with a reset to 0. It is keyboard reachable and passes the axe checks.
5. `BATCH_FRAMES` is the value S5 measured (see the findings document); the worklet and its consumers accept any value
   from 1 up.
6. Production capture delay is measured with the dev-only loopback tool (`scripts/capture-delay/`), which plays clicks
   at known AudioContext times and times their arrival through a capture of the same machine. The figures are one
   machine's estimate and are not claimed as guaranteed.
