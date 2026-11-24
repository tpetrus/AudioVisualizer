# Capture-delay tool

Dev-only command-line tool that estimates how long captured audio takes to reach an `AudioContext` on one machine. In
production the app captures audio (tab or screen audio through `getDisplayMedia`, or an input device such as Stereo
Mix through `getUserMedia`) while the listener hears the source directly, so the samples the analysis sees are
older than what the listener just heard. No browser API reports that delay. The tool measures it by loopback: a page it
serves itself plays short clicks at known `AudioContext` times through the speakers and, in the same context, records
a capture of this machine's own audio. Each click's arrival time minus its scheduled time is the delay. Nothing in
`app/` is used or changed.

The recording is sample-accurate on the audio clock: an `AudioWorklet` receives the captured stream and posts every
block with the context's `currentFrame`, so each sample has an exact context time. The capture is never connected to
the destination, so nothing feeds back. The page only records; the pure modules in `scripts/capture-delay/` (click
detection, statistics, report) run in node and have specs.

## Run it

```
npm run measure:capture-delay -- --source <tab|device|direct> [options]
```

Options: `--device <label substring>`, `--clicks N` (default 20), `--interval S` (default 0.5), `--out <file.json>`,
`--headless` (only with `--source direct`). No arguments prints usage.

- **tab** (Windows, Chrome-family browser window the tool opens): run with `--source tab`. In the window click Start,
  choose **This Tab** in the picker and tick **Also share tab audio**. The clicks play through your speakers and are
  captured from the tab's own audio.
- **device**: enable Stereo Mix (Sound settings, Recording devices, show disabled devices, enable "Stereo Mix"), turn the
  speakers on at a moderate volume, then run `--source device --device "Stereo Mix"`. If the label is omitted or
  matches nothing, the tool prints the available input labels and exits 1.
- **direct**: `--source direct --headless`. The click bus also feeds a `MediaStreamAudioDestinationNode`, captured
  back through a `MediaStreamAudioSourceNode`. It needs no hardware and no prompt, and checks the measuring pipeline
  itself.

## What the numbers mean

- **Clicks found / missed**: a click is found at the first sample after its scheduled time that rises above 8 noise
  standard deviations and above a quarter of the recording's peak, before the next click's scheduled time. Fewer than
  half found means the measurement failed (exit 1); the usual causes are tab audio not shared, the wrong device, or a
  muted output.
- **Arrival minus scheduled** (median, p5, p95, ms): the time from the context scheduling the click to its samples
  arriving back. For a device such as Stereo Mix it includes the output path (`outputLatency`) and the capture path;
  a tab capture probably taps the audio before the output device, so it holds the capture path only.
- **baseLatency / outputLatency**: the browser's own figures for the context.
- **Estimated delay relative to hearing** (tab and device): median minus `outputLatency`. The listener hears a click
  about `outputLatency` after it is scheduled, so this is roughly how much later the capture delivers it than the
  listener heard it.

## Limits

- One machine and one setup. The real source in production is another tab or app, and its capture path can differ from
  this loopback.
- `outputLatency` is the browser's estimate, not a guaranteed figure, and some setups report 0 or nothing; the report
  prints `n/a` then and the hearing-relative figure is just the median.
- The direct source includes whatever the in-page stream round trip itself adds (the destination-to-source stream
  buffers in Chromium); on the machine it was written on that was 18.0 ms in one run and 20.7 ms in another, with no spread
  inside a run, so treat the direct median as the pipeline's own floor, not as zero. Whether a tab or device capture
  carries the same buffer is not known, so the floor is not subtracted from their figures.
- Clicks are matched only within the interval after their scheduled time; a delay longer than `--interval` would make
  each click land in the next click's window. The tool spots that (first click missed, the rest found) and fails with
  a message to raise `--interval`, instead of printing a median that is off by one interval. `--clicks` times
  `--interval` is capped at 60 s.
- The tab and device flows need a person and real hardware and are not covered by automated tests; the pure parts
  (arguments, click detection, statistics, report) are.

## AC9 run sheet: tab and device loopback

AC9 of the alignment-tracker-leftovers plan asks for real figures instead of the 0 in `CAPTURE_DELAY_MS`
(`app/features/audio/timingModel.ts`). Only a person at real hardware can produce them: four loopback runs, two per
source. Follow this sheet, fill the tables, and the decision rule below says what, if anything, changes in the code.

### Before you start

- Windows with a Chrome-family browser installed (the tool opens its own window), `npm ci` done, and the speakers on at
  a moderate volume. Close other tabs and apps that play sound, and use the same output device for all four runs.
- Do each source twice, ideally in two separate sessions (for example two different days or after a reboot), so the
  second run is not a copy of the first.
- Keep every run's `--out` file; the table points to it.

### Run the tab source (twice)

The tab capture reads the tab's own audio, so no cable is needed: the clicks play through the speakers and the picker
captures them from the tab itself.

```
npm run measure:capture-delay -- --source tab --out capture-delay-tab-1.json
npm run measure:capture-delay -- --source tab --out capture-delay-tab-2.json
```

In the window the tool opens, click Start, choose **This Tab** in the picker and tick **Also share tab audio**. Without
the shared audio no clicks arrive and the run fails (exit 1). Defaults are 20 clicks 0.5 s apart; the run fails if fewer
than half are found.

### Run the device source (twice)

The device source needs the loopback wired through the sound card's mix: enable **Stereo Mix** (Sound settings,
Recording devices, show disabled devices, enable "Stereo Mix"), and make sure the speakers (the default output) are
what the mix records. Then:

```
npm run measure:capture-delay -- --source device --device "<Stereo Mix label>" --out capture-delay-device-1.json
npm run measure:capture-delay -- --source device --device "<Stereo Mix label>" --out capture-delay-device-2.json
```

`<Stereo Mix label>` is any part of the input's label, matched without regard to case (for example `Stereo Mix`). If
the label is omitted or matches nothing, the tool prints the available input labels and exits 1; copy the part you need
from that list. Write the full label of the device the tool picked in the table.

### What to copy from each run

From the report the tool prints (and the `--out` file): clicks found out of clicks sent, the median of "arrival minus
scheduled" in ms, and `outputLatency` in ms (`n/a` when the browser reports 0 or nothing). The hearing-relative figure is
the median minus `outputLatency`; the report prints it as "Estimated delay relative to hearing". When `outputLatency` is
`n/a`, leave the figure blank: the rule below cannot use it.

### Results

| Run      | Date | Machine | Browser | Source | Device label | Clicks found / sent | Median (ms) | outputLatency (ms or n/a) | Hearing-relative (ms) = median - outputLatency | Output file |
| -------- | ---- | ------- | ------- | ------ | ------------ | ------------------- | ----------- | ------------------------- | ---------------------------------------------- | ----------- |
| tab 1    |      |         |         | tab    |              |                     |             |                           |                                                |             |
| tab 2    |      |         |         | tab    |              |                     |             |                           |                                                |             |
| device 1 |      |         |         | device |              |                     |             |                           |                                                |             |
| device 2 |      |         |         | device |              |                     |             |                           |                                                |             |

| Kind                              | Figures agree within 10 ms and outputLatency known? | CAPTURE_DELAY_MS (mean, rounded to 5 ms, or 0) | Reason if 0         |
| --------------------------------- | --------------------------------------------------- | ---------------------------------------------- | ------------------- |
| `screen` (from `--source tab`)    |                                                     |                                                |                     |
| `device` (from `--source device`) |                                                     |                                                |                     |
| `file`                            | not measured                                        | 0                                              | stays 0 by decision |

### Decision rule (contract C4)

`--source tab` maps to the app's capture kind `screen` (decision D8); `--source device` maps to `device`. Judge each
kind on its own two runs:

- If the two hearing-relative figures agree within 10 ms and `outputLatency` was known in both runs, `CAPTURE_DELAY_MS`
  for that kind becomes their mean, rounded to the nearest 5 ms.
- If the figures differ by more than 10 ms, or `outputLatency` read `n/a`, that kind stays 0. Write the reason in the
  "Reason if 0" cell above, with the figures.
- `file` stays 0.

A kind with a non-zero value also gets a new default: a later code slice (S2b) makes `CAPTURE_DELAY_MS` of the current
kind the default sync offset for users with no saved sync offset. It moves the visuals earlier by that delay, clamped to
the slider range (`SYNC_OFFSET_MIN_MS` to `SYNC_OFFSET_MAX_MS`), and a saved offset always wins. If neither kind is
stable, S2b does not run and AC9 is recorded with these runs and the reason.

### Where the results go

Record the filled tables in this section, in the pull request that adds them (docs only). The code change (the
`CAPTURE_DELAY_MS` values and the default sync offset) follows in its own pull request, S2b, and cites these tables.
