# Run status: rhythm stability outstanding outcomes

Kept here because the shared verified-diamond state (`current-task.json`) was replaced at 2026-11-11 15:40 UTC by another
session working on "Natural dance for the dancing character". Do not run `vd.py init` for this plan again without checking
that session is finished. Base revision of the plan: 6bccc89. Plan hash 2b41adbdc3b28a5c.

## Decisions from Trevor (2026-11-11, "use your recommendations")

- S11 goes ahead: bar-repeat tie-break, 4L + 8L at each rival's own lag at the full window, a draw keeps the winner, no kick vote.
- lonley's half-speed dance: narrow the release (`MAX_DANCE_BPM_RELEASE` 0.998), not a delayed half time.
- S7: decided after S11 and S5, from its own evidence.

## Slices

| Slice | PR | State | Notes |
|---|---|---|---|
| S1 tools, probe, fixtures | #69 | merged | adds 0.04 kB |
| S2 pin state.bpm | #67 | open | retitled chore because the version check counts app/ test files as shipping |
| S3 dance speed cap | #68 | merged | no visual baseline change |
| S4 evidence | #71 | open, docs | needs a rebase on main |
| S5 syncopation-no-kick causes | none | not started | depends on S11. Needed: S11 alone makes the track change speed near 16 s |
| S6 octave and grid keep, release band | #72 | open | total JS 312.43 kB |
| S7 dotted boundary | none | not started | depends on S5 and S11. Old-pulse test only partly separates a correction from a change |
| S8 bass gate bar repeat | #74 | open | opens 1.2 to 6.2 s later on every track. Judge by ear |
| S9 crossfade at meter lock | none | not started | depends on S3 (merged) and S6 |
| S10 final results | none | not started | last |
| S11 first-lock tie-break | #73 | open | total JS 312.80 kB, limit raised to 313.25 kB |
| S12 gate replay, report fixes | #70 | merged | |

## Open follow-ups recorded in followups.json

FU-state-bpm-standin-spec, FU-app-csv-infinity.

## Live checks

Combined branch (S11 + S6 + S8 on main) measured in `.claude/worktrees/vd-live`, logs in the scratchpad.
