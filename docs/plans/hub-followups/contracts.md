# Hub follow-ups: frozen contracts

Frozen by the verified-diamond orchestrator before any worker was dispatched (plan `hub-followups` r1, hash
`8bcf00a67ff72cd3`, base `bb1e55fe5f14`). Workers implement against these and never edit this file; a change goes back
to the orchestrator.

## C1: gateBass snapshot (hub contract C1)
`gateBass.pulse` is the newest audio, not shifted by the sync offset (`bands`, `lowEnd` and `beat` are). When
`tracker.getSource()` is undefined it reads 0 and the gate-input tap is disconnected. A transiently undefined
`renderTimeNow()` with the same source keeps the tap (no rebuild, no pulse gap). `update(now)` with an explicit time
behaves as before. Wording is updated in `docs/plans/hub-regressions/contracts.md`, `app/features/audio/hub/types.ts`
and the hub class comment in `app/features/audio/hub/audioHub.ts`. Owner: S2.

## C2: Analyzer counters
`RhythmAnalyzer` and `BoundaryDetector` expose a read-only soft-boundary counter; the replay takes song-change times
from its own loop, at each rise of `songChangeCount` (the analyzer's unread last song-change time was removed in the
follow-up `HF-S2-last-song-change-time`).
`RhythmState` is unchanged. The scorecard engine (`scripts/scorecard/engine/boundaryProbe.ts`, `songChanges.ts`) reads
the counters and no longer wraps prototype methods. Offline scorecard cells stay identical. Owner: S2.

## C3: DEV telemetry columns
New DEV-only `debug:viz` CSV columns: dancer `placedKicks`, `phaseOnsets`, `sceneBuiltAt`, `modelParsedAt`; bass-ink
`sceneBuiltAt`. Guarded by `import.meta.env.DEV`, absent from production bundles (within 0.1 kB of base). `debug:summary`
tolerates their absence in older CSVs. Owners: S4 adds the DEV-only gate-state field that counts kicks placed from
before the lock; S3 adds the dancer columns and `debug:summary` tolerance; S5 adds the bass-ink column. Consumed by S7.

## Ownership deviations from the plan's draft DAG
Each file has one owner for the whole feature. So the order is S1 → S2 → S4 → S3 → S5 → S6 → S7 (S4's offline gate
measurement does not need S3's live columns; S3 needs S4's gate field). The orchestrator integrates the ledger and
`docs/agents/hub-scorecard.md` after S1, from rows and text the workers report. D12 (documenting the `hub.onsets`
scales) moves to S2, which owns `types.ts` and `architecture.md`. S7 runs with the orchestrator and Trevor, because the
live recordings happen in the main checkout.

## C4: Scorecard targets v9
`TARGETS_VERSION` 9: drifting tracks are scored against a quadratic fit of tapped beat times; clip is compared within
the bar only when at least 3 runs are meter-locked and every compared run has `beatsPerLoop` of 4 or more, with the
skipped share reported and a minimum span share; hit-share tolerance is `min(0.05, 0.1 × pre-hub)` (amended 2026-11-21 by Trevor in S6: the plan's `max` is never tighter than 0.05 and could not fix `FU-S4-hitshare-relative-tolerance`). Live v8 files are
recomputed by `npm run scorecard:live -- --ingest`. Owner: S6; consumed by S7.
