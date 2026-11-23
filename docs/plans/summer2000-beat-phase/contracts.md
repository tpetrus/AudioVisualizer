# summer2000 beat phase: frozen contracts (verified-diamond run, base `3349cc0`)

Frozen by the orchestrator before any worker ran. Workers may not change them; a needed change is an escalation.

## C1 tracker.state (unchanged)
- `app/features/rhythm` `tracker.state` fields and their meaning do not change.
- A kick phase move (the entry anchor or the loop) moves `pendingBeat`, bumps `phaseShiftCount`, never bumps `gridEpoch`.
- `beatCount` never decreases. The period trim never calls `setTempo` and never trips its 4% hysteresis or a re-search.
- Halving, doubling, rebuild, the `BEAT_LOST_BEATS` re-search and `reset()` clear the kick gate ring, the summed phase
  moves and the period trim, without bumping `gridEpoch`.

## C2 pushKicks delivery
`RhythmAnalyzer.pushKicks(band, time, strength, count)` is called once per `BATCH_FRAMES` batch, before that batch's
frames, by `RhythmTracker.onMessage` and every offline runner, now including `app/features/rhythm/eval/detect.ts`
(`detectFromPcm`) and `app/features/rhythm/testSignals.ts` (`runPipeline`), exactly as
`scripts/scorecard/engine/replay.ts` `pushBatchToAnalyzer` does. With no kick consumer enabled the output is identical.

## C3 rhythmConfig constants (one `export const` per line, `--set` overridable, off by default)
Kept from attempt A as the entry anchor: `KICK_LEAD_SECONDS` (0, shared by the anchor and the loop; this is the plan's
KICK_LEAD_MS, kept in seconds like the code), `KICK_PHASE_BINS` 16, `KICK_PHASE_DECAY` 0.9, `KICK_SUPPORT_FLOOR` 2
(off; the grid sets 0.2), `KICK_MOVE_MARGIN` (renamed from `KICK_VETO_MARGIN`; default 0.1, the grid sets 0.05),
`KICK_MOVE_BEATS` 4 (the grid sets 2).
Removed: `KICK_FILL_BEATS`, `KICK_FILL_CV`, `KICK_RECOVER_BEATS`, `KICK_RELEASE_BEATS` (unless the anchor still needs a
release, then kept with the same meaning), `KICK_OFFSET_RING`, `KICK_OFFSET_HYSTERESIS`, and the veto and hold behavior.
Added for the loop (S2 task): `KICK_PHASE_GAIN` 0 (0 makes the whole loop inert), `KICK_PERIOD_GAIN` 0.01,
`KICK_WINDOW_FRAC` 0.25, `KICK_GATE_N` 6, `KICK_GATE_M` 8, `KICK_SPREAD_FRAC` 0.1, `KICK_MAX_PHASE_FRAC` 0.35,
`KICK_MAX_PERIOD_PCT` 1, `KICK_SUPPRESS_ONSET` 0. Gate values are placeholders until the S3 pre-flight.

## C4 read-only getters (BeatTracker, mirrored on RhythmAnalyzer where the runners need them)
`kickSupport`, `kickMargin` (from attempt A), `kickEngaged` (boolean, gate open), `kickPeriodTrim` (fraction),
`kickResidual` (seconds, last deferred residual or NaN), `kickPhaseMoveSum` (seconds), `kickEngagedBeats` and
`declaredBeats` counters (engaged share = engaged / declared). Read-only; no consumer in app UI.

## C5 `npm run scorecard -- --set NAME=VALUE` (dev CLI)
- Repeatable. Parsed with `parseOverride` and applied with `createOverridePlugin` (`scripts/rhythm-tools/ablate*.ts`), so
  unknown names and malformed values fail as they do in ablate:rhythm.
- With any `--set`, `run.ts` re-bundles itself with the override plugin and runs that bundle; the overrides reach every
  module that imports `rhythmConfig.ts`. A bundle that never loaded `rhythmConfig.ts` is an error.
- `--set` with `--write-baseline` exits non-zero before measuring. `--set` without an explicit `--out` exits non-zero
  (each grid point writes its own file and never clobbers `docs/agents/hub-scorecard.cells.*`).
- The output json records `header.overrides` (`{ NAME: "VALUE" }`), absent when no `--set`; `scorecard:check` accepts
  it (spec).
- The S2 task adds a per-track kick engaged share to the json (outside `cells`, so the check ignores it).

## Orchestrator decisions frozen before S2 (2026-11-23, measured on `b983f57`)
- **OD1 The entry anchor needs the kick gate open.** Measured: attempt A's move alone (floor 0.2, margin 0.05, 2 beats)
  gives summer2000 163.0 ms and low-bpm-rnb 181.4 ms (baseline 24.2) in a full scorecard, so an ungated anchor fails
  every grid point on low-bpm-rnb before the loop acts. The plan's gate exists so sparse or off-beat kicks never engage
  the model (K3); it now governs the anchor too. The anchor's move resets the summed loop moves to 0 (the anchored grid
  is the new reference for `KICK_MAX_PHASE_FRAC`).
- **OD2 Delay compensation.** The residual of beat k is read at the declaration of beat k+1 (F1). Beat k+1 was declared
  before the move computed from beat k-1, so the raw residual still contains it. The residual is therefore reduced by
  the kick phase move applied since beat k was declared (a Smith predictor). Without it the loop is
  x[n+1] = x[n] - g x[n-1], marginally stable at the registered gain 1.0. With it the loop is x[n+1] = (1-g) x[n],
  stable for every registered gain. The plan's "loop stable at the highest grid gains" spec checks this.
- **OD3 The gate observes even when off.** The gate ring, the in-window count and the residual MAD are updated on every
  declared beat that has stored kicks, whatever `KICK_PHASE_GAIN` is, so the S3 pre-flight can read them with
  trace:beats. Moves happen only when `KICK_PHASE_GAIN > 0` (loop) or the anchor's floor is reached and the gate is open.
  With defaults (floor 2, gain 0, suppress 0) the scorecard cells stay identical.
- **OD4 Pre-flight rule, stated before any pre-flight data (K6 made concrete).** For each N in 3..8 (M = 8), run
  trace:beats with gain 0, the anchor at floor 0.2, margin 0.05, 2 beats, and `KICK_GATE_N` = N. N qualifies when the
  in-window count reaches N on at least 70% of summer2000's beats after 12 s with `KICK_WINDOW_FRAC` 0.25, and no beat
  of low-bpm-rnb reaches an in-window count of N-1 with `KICK_WINDOW_FRAC` 0.35. Take the smallest N that qualifies;
  none qualifies means no-go (S6). `KICK_SPREAD_FRAC` = the 90th percentile of summer2000's residual MAD over its
  beats after 12 s, in fractions of the period, at window 0.25 and that N, rounded up to 0.01.
