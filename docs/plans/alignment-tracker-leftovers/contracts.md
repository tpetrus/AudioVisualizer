# Alignment and tracker leftovers: frozen contracts (verified-diamond run, base `6efe7bc`)

Frozen by the orchestrator before any worker ran, from plan revision 1 (hash `fd953c11a097df15`). Workers may not
change them; a needed change is an escalation. C1 to C4 are the plan's `freeze_first` contracts, copied unchanged;
OD1 to OD7 are the orchestrator's decisions where the plan left a number open or the repository moved after planning.

## C1 Probe pre-registration (process)
`probe-plan.md` is merged in its own PR before any probe run and fixes: the score formula, lag set, band set and margin;
targets per family (level and meter: 3/4-180 synthetic, 6-8-time, half-time-shuffle, syncopation-no-kick; candidate
set: high-bpm-dnb; beatless); controls including at least one faster-level-truth track, one true 3/4 or 6/8 track and
one true half-time track besides summer2000, lonley, drums-128, imyourgirl and syncopationbass2; held-out tracks (every
other scorecard track plus untouched start offsets) whose pass is the condition for a go; the 10 syncopation-no-kick
start variations defined as exact offsets and counted as one sample. A threshold change needs a new merged revision
that Trevor approves in its PR.

## C2 Gate ladder and no-go rule (process)
Every tracker slice is judged against the committed baseline at its start (after S5, the glide's baseline) and passes,
in order: unit specs (`it.fails` removed if fixed), `npm run scorecard`, `npm run scorecard:check`, `sweep:gate` false
opens not above baseline, `bench:tracker` median ratio at most 1.05, `npm run size` within the limit with the slice
adding at most 0.15 kB (see OD2), then its AC numbers on held-out tracks. A slice that passes commits a refreshed
baseline. Any miss ships nothing, the code is reverted, and the family is recorded as accepted as measured with the
measured values.

## C3 Published phase glide (behavior)
In `RhythmAnalyzer.updatePhase`, when a re-align moves the grid by more than `phaseGlideMinMs`, the anchor eases to the
new grid over `phaseGlideMs` (pre-registered grid 0, 100, 150, 250 ms; 0 reproduces the old jump). `beatPhase`,
`nextBeatTime` and the beat and bar counters all derive from the eased anchor, so the counter increments exactly when
the published phase wraps. Scorecard readers (replay beat times, gateTrace, live clip) all see the eased values. Glide
state resets on clear, hardReset and grid epoch change, restarts on a second move, and treats a backwards now as no
progress. No allocation per frame.

## C4 Capture delay as default sync offset (config)
`CAPTURE_DELAY_MS.screen` and `.device` become the mean of two hearing-relative figures (loopback median minus
outputLatency), rounded to 5 ms, only when they agree within 10 ms and outputLatency is known; otherwise 0. `file` stays
0. When no sync offset is saved, the engine starts at the offset that moves visuals earlier by `CAPTURE_DELAY_MS` of
the current kind, clamped to the slider range; a saved offset always wins.

## Orchestrator decisions
- **OD1 Base.** `main` moved 16 commits after the plan's base `2b95c68` (#135 to #139: kick events into `BeatTracker`,
  `scorecard --set`, the summer2000 no-go). Every task starts from `origin/main` at `6efe7bc` or later. The plan's
  figures for the S0 baseline (446 cells, 338.12 kB) are superseded: each slice is judged against the committed
  `docs/agents/hub-scorecard.baseline.json` and the measured size at its own start.
- **OD2 Budget.** #136 raised the total-JS limit in `.size-limit.json` from 338.5 to 339 kB, outside this plan. D10 is
  read as: this plan raises no limit; each code slice adds at most 0.15 kB of total JS (gzip), measured with
  `npm run size` on its base and on its head; the total stays within the limit in `.size-limit.json` at the slice's
  start. A slice that needs more is a no-go.
- **OD3 S2 is split.** S2a writes the run sheet only (docs). Trevor's four loopback runs are a human step. S2b (code:
  values and the default sync offset) runs only if at least one kind is stable by C4, and is designed then. Two
  questions are left to S2b: how storage tells "no saved offset" from a saved 0 (today `loadSyncOffsetMs` returns 0 for
  both), and whether the settings' Reset button returns to the kind's default by clearing the saved value. If neither
  kind is stable, S2b is not run and AC9 is recorded with the measured runs and the reason.
- **OD4 C3 numbers.** `PHASE_GLIDE_MIN_MS` is 20 (two 10 ms hops; a smaller move is not visible as a jump at 60 fps).
  The glide duration is a `rhythmConfig.ts` constant `PHASE_GLIDE_MS`, one `export const` per line so `--set` can
  override it. The grid is 0, 100, 150 and 250 ms, run with `npm run scorecard -- --set PHASE_GLIDE_MS=<v> --out <file>`.
- **OD5 The phase-step measure (AC6's pre-registered value).** Replay each scorecard track through the analyzer as the
  scorecard does and call `updatePhase` at 60 fps render times (step 1/60 s, no sync offset). Per call after the first
  with a published phase, the excess step is `|wrap(phase - previousPhase) - (1/60) / period|` in beats, where
  `wrap` maps into [-0.5, 0.5) and `period` is the anchor period used for the call. The measure is the largest excess
  step over every track whose `gridMoves` count (`BeatTracker.phaseShiftCount`, the dancer's telemetry column of that name) is above 0. Pre-registered pass: at most **0.10 beat**.
  The 0 ms grid point must reproduce the old jump (its measure is reported as the baseline figure). The chosen value is
  the smallest of 100, 150 and 250 ms that passes every AC6 gate; if none does, S5 is a no-go under C2.
- **OD6 Who writes what.** S3's `probe-plan.md` is the C1 pre-registration, so the orchestrator writes it and Trevor
  approves it in its own PR. S5 adds the OD5 measure as a dev script under `scripts/rhythm-tools/` run through the same
  `npx esbuild ... && node ...` form as the dancing-character scripts, with no `package.json` change.
- **OD7 Worktrees and live runs.** Each worktree runs its own `npm ci` and reads the tracks through `--dir
  C:/Users/trevo/CODE/AudioVisualizer/.debug-in`; nothing is linked; worktrees are removed with `npm run
  worktree:remove`. `scorecard:live` and `scorecard:order` (S8) run only from the main checkout on `main`, one at a
  time, with no builder running.
