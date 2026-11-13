# Tap-along tool

Dev-only command-line tool for making ground-truth beat files by tapping along to a local track. The debug tracks are
real songs with no beat annotations; tapped beats are the cheap ground truth. Nothing in `app/` changes: the tool
drives the dev server in a headed Chromium (like `npm run debug:viz`) and records Space key presses with the playback
position from `window.__vizTelemetry.playback()`.

## Calibrate once

A human taps a roughly constant time early or late and with some scatter. Measure both on a synthetic click track whose
beats are exactly known:

1. `npm run ground-truth -- <dir>` writes click tracks with `<name>.beats.json` beside them.
2. `npm run tap:beats -- --dir <dir> --track <click-track.wav> --calibrate`
3. Tap Space on every click until the track ends (Enter or Escape ends it early). At least 8 taps are needed.

This writes `<dir>/tap-calibration.json` (`{ offsetMs, noiseFloorMs, taps, track }`) and prints both numbers.
Recalibrate if your setup changes (another keyboard, another machine, another audio device).

## Tap a track

`npm run tap:beats -- --dir <dir> --track <song.mp3> [--viz <name>] [--force]`

Tap Space on each beat. Key auto-repeat is ignored, and taps closer than 120 ms to the previous kept tap are dropped as
double hits. At the end the tool subtracts the offset from every tap and writes `<dir>/<song>.beats.json` (a
`BeatSidecar` with `source: 'tapped'`). The tempo comes from `<song>.bpm` when present, otherwise from the median gap
between taps. An existing sidecar is never overwritten without `--force`. Without a calibration file the tool refuses
to run and tells you to calibrate first.

## What the two numbers mean

- **Offset** (`tapOffsetMs`): the median of tap time minus true beat time, in ms. Negative means you tap early. It is
  constant, so it is removed from every tap.
- **Tap-noise floor** (`tapNoiseFloorMs`): the standard deviation of the errors after removing the offset. It cannot be
  removed. Any figure measured against tapped beats (beat error, onset alignment) is only meaningful beyond this
  floor, so quote it beside every such figure: a median error of 25 ms against a 20 ms floor says little.

## Privacy

Audio files and tapped sidecars stay local and are not committed. Only the tool and these docs are in the repository.

The interactive flow (a person tapping in a headed browser) is not covered by automated tests; the pure parts (argument
parsing, tap clean-up, calibration maths, sidecar assembly) are.
