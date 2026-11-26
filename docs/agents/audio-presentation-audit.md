# Audio alignment: presentation audit

Slice S10 of the audio alignment plan. For every visualizer in the landing list: what it reads, how it smooths it, and
how long after a hit its values move. These delays are the baseline for the migration check (a visualizer moved onto
the shared hub may not get more than 10 ms worse). Measured on 2026-11-13 at commit `c1047ca`; see
`audio-alignment-findings.md` for the method and its limits.

Target: 30 ms plus one frame (16.7 ms at 60 fps) = 46.7 ms. Each figure is the median over one 30 s recording, headless
at 60 fps, read from scene state with `npm run debug:summary -- <csv> --reaction <column>`. Rows are one frame apart, so
each figure is uncertain by about 19 ms. "Hits" is how many of the track's beats got a reaction within 250 ms.

## Table

| Visualizer | Analysis inputs | Smoothing and catch-up | Input delay: click-120 | Input delay: drums-128 | Output delay | Against target |
|---|---|---|---|---|---|---|
| cubes | Own analyser (FFT 2048, smoothing 0.5): 40 Hz to 14 kHz log bands (`bands.ts`). `BassPulse` for the bass pulse (since S7: the hub's low end through `bassBump.ts`, see "cubes (S7)" below) | Bands rise fast and fall by the user's smoothing control, per frame. `BassPulse`: rises by 0.45 and falls by 0.12 of the gap per frame (settles in about 0.3 s at 60 fps) | `cubes.in` 18.7 ms (57 of 57) | `cubes.in` 35.9 ms (20 of 61) | `cubes.out` 29.5 ms on drums (16 of 61); never moves on the click track | Within target where it reacts |
| trio-color-wave | Three analysers of its own (FFT 1024, 2048, 4096; -90 dB floor; smoothing from the user control) | Analyser smoothing, plus loudness balancing against each band's recent peak | `trio-color-wave.in` 28.0 ms (59 of 59) | 16.5 ms (17 of 63) | `trio-color-wave.out` 28.0 ms on clicks, 16.5 ms on drums | Within target |
| bass-ink | Own analyser (FFT 2048, smoothing 0.8): 48 log-spaced frequencies (`spectrumField.ts`) and a bass level below 120 Hz. `BassPulse` into the shared bass gate (since S9 of hub-regressions: the hub's `gateBass.pulse` through `bassBump.ts`). Tracker beat phase, tempo confidence and kick onset | Spectrum: attack 0.03 s, release 0.22 s against a 1.5 s running average. Mid band: 0.3 s and 1.2 s. Sparkle: 0.15 s and 0.6 s. Motion clock follows the tracker's beat phase | `bass-ink.in` 9.3 ms (59 of 59) | 19.1 ms (32 of 63) | `bass-ink.out` (governed brightness) does not react to single hits. `bass-ink.kicks` (gate pulses): 49 to 57 ms on `imyourgirl` and `syncopationbass2` (45 to 60 hits of 62 to 75); about 240 ms on `lonley` (5 to 7 of 70) | Input within target. Gate pulses miss it by 3 to 10 ms on good tracks and by about 190 ms on `lonley` |
| dancing-character | `BassPulse` into the shared bass gate. Tracker tempo, beat phase and meter | `BassPulse` as above. Dance clips follow the beat clock | `dancing-character.in` never moves (a click has no bass) | 27.5 ms (15 of 60) | `dancing-character.out` no reaction to single hits on either track | Input within target. Output is beat-driven, not hit-driven |

Shared by all four: the tracker's onset bands (`onsetKick`, `onsetMid`, `onsetHigh`) arrive a median 49 to 60 ms after
the hit (p95 80 to 95 ms) in all eight recordings. That misses the target by 2 to 13 ms at the median and by about
45 ms at the 95th percentile.

## Findings
1. **Reading the analyser directly is prompt.** Every visualizer's own input reacts within 9 to 36 ms. Presentation
   smoothing is not what makes the visuals feel late.
2. **Anything that goes through the tracker is late.** Onsets by about 55 ms (batching), gate pulses by 49 to 57 ms on
   the tracks where the beat is right.
3. **Gate pulses follow the beat position, so they inherit its errors.** On `lonley` they land about 240 ms after the
   tapped beat. This is analysis error, not presentation lag.
4. **Low hit counts on the drum track are expected for bass-driven inputs.** `drums-128` has a kick on two of four
   beats, so a bass input can react to about half the beats (15 to 32 of about 61).
5. **Two outputs have no per-hit reaction to measure.** `bass-ink.out` is a governed brightness and
   `dancing-character.out` is driven by the beat clock. Their migration baseline has to be a hit-driven column
   (`bass-ink.kicks`, `dancing-character.in`), not `.out`.
6. **`cubes.out` stays at 0 on the synthetic click.** The click is a mid-frequency tone and the pulse is bass-only; the
   bars still react (`cubes.in`). Not a fault, but a click track cannot be the migration check for `cubes`: use
   `drums-128`.
7. **`BassPulse` smooths per frame, not per second** (0.45 and 0.12 of the gap each frame). At 30 fps or 144 fps the
   pulse rises and settles at a different speed. Not measured here (all recordings ran at 60 fps). No visualizer uses it
   any more: the cubes, the dancer and (since hub-regressions S9) `bass-ink` read the hub through the time-based
   `BassBump`.
8. **The gate envelope reads bumps for the first seconds of a source** (found in bass-ink-refine S3, not a fault).
   `GATE_BASS_BUMP` is unseeded on purpose (see `bassBump.ts`), so its slow follower climbs from 0 and the ratio reads
   as bumps meanwhile; in a unit test a steady bass needed about 480 frames (8 s at 60 fps) to stop reading as bumps.
   Since bass-ink-refine, bass-ink's lock-free swell and glow follow this envelope, so they can pulse on steady bass
   just after a source starts. No hub change was made.

   Measured on 2026-11-25 (`npm run debug:viz -- --viz bass-ink --seconds 20 --from 0 --headless`, one run each, 60
   fps): the share of frames with `bass-ink.swell` above 0.3 was 0.79 and 0.71 in the first two 4 s windows of
   `beatless` against 0.86 and 0.22 later. On `syncopation-no-kick` it was 0.88 and 0.82 against 0.74 and 0.70, and on
   `low-bpm-rnb` 0.88 and 0.67 against 0.69 and 0.70. The first 8 s do not stand out, so bass-ink gets no warm-up. The
   measurement shows a different effect: `bass-ink.gateIn` (the bump) has a median of 0.22 to 0.50 on every track, and
   at bass-ink's swell gain of 3 the swell sits near full most of the time instead of pulsing (mean 0.52 on
   `beatless`, 0.74 on `drums-128`). That was a bass-ink tuning question, not a hub fault. bass-ink now measures the
   bump against its own running level (`BassSwellShaper` in `bassInkBass.ts`), so a plateau rests at 0 and a rise
   stands out. Re-measured the same way on 2026-11-26: mean swell 0.11 on `beatless`, 0.18 on `drums-128` and
   `low-bpm-rnb`, 0.14 on `syncopation-no-kick`; upward crossings of 0.6 per 20 s were 15, 19, 24 and 21. Open: the hub's
   gate bass carries bursts of the same size on tracks without a kick, so `syncopation-no-kick` pulses about as often
   as `drums-128`. Separating them needs a better gate input from the hub, which bass-ink-refine did not change.

   Later the same day the user chose instant feedback over accuracy, because the beat lock takes a few seconds and
   everything large waits for it. The swell is now the bump itself (`swellFromBump`, like the cubes' `bump * bgPulse`),
   at amplitude 0.12. In 15 s headless runs it first passed 0.3 within 0.0 to 0.5 s of the start, against a lock at
   about 3.8 s and a first kick ripple at 4.4 to 6.9 s (`imyourgirl`, `drums-128`, `beatless`). The mean swell is 0.50
   to 0.64 again, and it pulses on `beatless` too, by design.

## Fixes and reasons

| Delay above target | Fix or reason |
|---|---|
| Tracker onsets, 49 to 60 ms median, 80 to 95 ms p95 | Reduced in S5: the batch is 2 frames (20 ms), median 20 to 23 ms and p95 31 to 36 ms, both inside the target |
| `bass-ink.kicks`, 49 to 57 ms on good tracks | Same cause as above (the gate runs on the tracker's clock); re-measure after S5 |
| `bass-ink.kicks`, about 240 ms on `lonley` | Fix in S6: beat position stability and the gate's choice of where the kick sits |
| `bass-ink.out`, `dancing-character.out`: no per-hit reaction | Reason: by design. Baseline uses `bass-ink.kicks` and `dancing-character.in` |
| `BassPulse` per-frame smoothing | Recorded as a follow-up: make the rise and fall time-based, then re-measure at 30 and 144 fps |

## Migration baselines (S7, S8)

| Visualizer | Column | Track | Baseline median | May not exceed |
|---|---|---|---|---|
| cubes | `cubes.in` | drums-128 | 35.9 ms | 45.9 ms |
| cubes | `cubes.out` | drums-128 | 29.5 ms | 39.5 ms |
| trio-color-wave | `trio-color-wave.out` | click-120 | 28.0 ms | 38.0 ms |
| bass-ink | `bass-ink.in` | click-120 | 9.3 ms | 19.3 ms |
| dancing-character | `dancing-character.in` | drums-128 | 27.5 ms | 37.5 ms |

Each baseline is one recording. Before a migration is judged against it, record it twice more: a single run cannot show
its own spread, and the 10 ms allowance is smaller than the 19 ms frame quantization.

### cubes (S7, 2026-11-16)
Judged as the mean of three 30 s headless recordings of `drums-128` at 60 fps, before (commit `2a19e55`) and after the
move onto the hub (`8558c6e`). The limit is the mean before plus 10 ms. The runs of the old code spread by about 8 ms,
close to the allowance, which is why one run is not compared with one run.

| Column | Before: medians (mean) | After: medians (mean) | Limit | Result |
|---|---|---|---|---|
| `cubes.in` | 31.3, 28.0, 23.7 ms (27.7) | 26.5, 26.2, 26.2 ms (26.3) | 37.7 ms | pass |
| `cubes.out` | 31.5, 26.5, 31.5 ms (29.8) | 31.8, 33.0, 27.8 ms (30.9) | 39.8 ms | pass |

- `cubes.in` is a different signal now: the hub's low end (the louder of `sub` and `kick`, 0..1 normalized) instead of
  BassPulse's RMS below 120 Hz. It crosses the reaction threshold on 17 of 61 beats, against about 30 before;
  `cubes.out` reacts on 16 of 61, as before (16 to 19).
- The p95 of `cubes.out` rose from 42 to 67 ms to 59 to 74 ms.
- The synthetic onset F part of the check does not apply to cubes, which reads no onsets.
