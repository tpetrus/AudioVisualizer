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
  module (`bandOnsets.ts`) that allocates only in its constructor, so the offline evaluation runs exactly the code the
  worklet runs.
- `bandEnergy` is in the packed frame's energy units and not normalized; normalizing is the hub's job (C5, S7).
- `BATCH_FRAMES` stays 8 in S4. S5 measures and cuts it.
- C5 and C6 are written at the start of the slices that implement them (S7 and S5).
