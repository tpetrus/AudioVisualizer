# Hub regressions: contracts

C2 (scorecard cell) and C3 (scorecard commands) of this plan are frozen in `scripts/scorecard/types.ts`. This file holds
the ones that live in the app.

## C1 hub gate-input bass (frozen at the start of S4, 2026-11-18; source revised 2026-11-19)

The types are the contract: `HubGateBass` and `AudioHubSnapshot.gateBass` in `app/features/audio/hub/types.ts`, and
`GATE_BASS_CUTOFF_HZ` and `GATE_BASS_WINDOW` in `app/features/audio/hub/gateBassTap.ts`. Decided with Trevor from the
S4 measurement (`npm run probe:gate-inputs`; the figures are in the plan's amendments).

- The feature is `BassPulse`'s: the RMS of the post-gain mono signal through two cascaded 120 Hz lowpass biquads over
  the newest 2048 samples. Two gates (the hub's low end or this feature, whichever opens first) were measured and not
  chosen: they open on random bass 1.4 times as often as pre-hub.
- **Where it is computed (revised 2026-11-19, Trevor's option A).** The hub reads it at the render time from its own
  tap of the tracker's source (`GateBassTap`: the two filters into an analyser, `BassPulse`'s chain), rebuilt when the
  source changes. It was first computed per frame in the worklet and carried in `FeatureBatch` version 3, but a frame is
  up to a batch old when the hub reads it, and live that made the cubes react 10 ms later than pre-hub on average and
  moved the dancer's learned kick place (S4's live findings in `docs/agents/hub-scorecard.md`). The worklet message is
  back to version 2, unchanged from before S4. Visualizers read the bass only through the hub (bass-ink too, since
  S9); `BassPulse` is the tap plus its envelope, kept only as the pre-hub reference for `BassBump`'s spec and the
  scorecard's pre-hub column.
- `gateBass.pulse` is that level, linear and not normalized. It is the newest audio and is not shifted by the user's
  sync offset (`bands`, `onsets`, `lowEnd` and `beat` are). It reads 0 when the tracker has no source, and the tap is
  then disconnected; a render time that is briefly undefined with the same source keeps the tap and the reading.
  `update(now)` with an explicit time behaves as before. `gateBass.lowEnd` is the louder of the `sub` and `kick` band
  energies before the hub's peak scaling, from the same frame as `bands` (the newest at or before the render time). Both are written in place, 0 before the first update and after a reset. The existing fields and
  their meaning are unchanged.
- Consumers run their own envelope over `pulse` (the dancer's gate and the cubes' bump use `BassPulse`'s fast and slow
  followers, per second rather than per frame).
