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
  arriving back. It includes the output path (`outputLatency`) and the capture path.
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
- Clicks are matched only within the interval after their scheduled time; a delay longer than `--interval` reads as a
  miss, so raise `--interval` if everything is missed.
- The tab and device flows need a person and real hardware and are not covered by automated tests; the pure parts
  (arguments, click detection, statistics, report) are.
