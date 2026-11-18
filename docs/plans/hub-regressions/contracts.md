# Hub regressions: contracts

C2 (scorecard cell) and C3 (scorecard commands) of this plan are frozen in `scripts/scorecard/types.ts`. This file holds
the ones that live in the app.

## C1 hub gate-input bass (frozen at the start of S4, 2026-11-18)

The types are the contract: `HubGateBass` and `AudioHubSnapshot.gateBass` in `app/features/audio/hub/types.ts`,
`FeatureBatch.gateBass` and `FEATURE_MESSAGE_VERSION` 3 in `app/features/rhythm/types.ts` (an addition to contract C3
of `docs/plans/audio-engine-alignment/contracts.md`), and `GATE_BASS_CUTOFF_HZ` and `GATE_BASS_WINDOW` in
`app/features/rhythm/rhythmConfig.ts`. Decided with Trevor from the S4 measurement (`npm run probe:gate-inputs`; the
figures are in the plan's amendments).

- The feature is `BassPulse`'s: the RMS of the post-gain mono signal through two cascaded 120 Hz lowpass biquads over
  the last 2048 samples. The worklet computes it once per frame, at the end of the frame's analysis window, so the gate
  hears the bass it heard before the hub through the single analysis path, at frame times. Two gates (the hub's low end
  or this feature, whichever opens first) were measured and not chosen: they open on random bass 1.4 times as often as
  pre-hub.
- `gateBass.pulse` is that level, linear and not normalized. `gateBass.lowEnd` is the louder of the `sub` and `kick`
  band energies before the hub's peak scaling. Both are read from the same frame as `bands` (the newest at or before
  the render time), written in place, 0 before the first frame and after a reset. The existing fields and their meaning
  are unchanged.
- Consumers run their own envelope over `pulse` (the dancer's gate and the cubes' bump use `BassPulse`'s fast and slow
  followers, per second rather than per frame). `BassPulse` itself stays for bass-ink until S9 moves it.
- The message grows by `BATCH_FRAMES` floats; a listener of another version skips the message, as before.
