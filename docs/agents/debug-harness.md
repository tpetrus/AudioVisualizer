# Visualizer debug harness

A development-only way to play a local music track through the real audio chain (gain, AGC, analysers) into a
visualizer and record how the scene's bass-driven values react. The developer watches it live in `npm run dev`; an agent
runs one command and reads a short windowed summary. Nothing here ships to production.

## Using it

**Live, as a developer.** Run `npm run dev`, open a visualizer, and in the audio source dialog choose
**Play a file (dev only)**. The track plays audibly through the normal chain. An overlay at the top left shows the
pre-gain bass (`bassRaw`), post-gain bass (`bassPost`), the AGC gain, fps and the visualizer's own bass input and
output, with a sparkline of the last two.

**Headless, as an agent.** One command per run; read the printed summary first, and open the CSV or a screenshot only
for a window the summary flags:

```
npm run debug:viz -- --dir "C:/Music/samples" --track song.mp3 --viz cubes --seconds 60 --shots 12,45
```

- Output goes to `.debug-out/<viz>-<track>-<stamp>/` (git-ignored): `telemetry.csv` (one row per rendered frame) and
  `shot-<t>.png` per requested time.
- The summary (at most 60 lines) gives per-window means and the visualizer's out/in ratio, and flags a window
  `FALLOFF` when the ratio drops below half the first window's. A window under 50 fps is marked `unreliable` instead,
  because the visualizers' followers advance per frame and behave differently at low frame rates.
- Headed is the default (real GPU, real frame rate). `--headless` uses Chromium's new headless mode, which still uses
  the GPU on a machine that has one; check the reported fps.
- Playback is real time: a run takes the requested seconds plus about 15 to 25 s to start the dev server and page.
- `npm run debug:summary -- <csv> [--bpm N] [--window S]` reprints a summary without re-running.
- **Tempo checks.** Put a sidecar named after the track next to it (`song.mp3` and `song.bpm`, one number, the format
  `eval:rhythm` reads) and the summary also judges the tempo against it, octave-normalized. Without a sidecar the tempo
  block is printed as a report with no pass or fail.
- `npm run debug:repeat -- <a.csv> <b.csv> [...] [--bpm N]` compares two or more recordings of one track on track time.
- `npm run ablate:rhythm -- <wav> --set NAME=VALUE [--set ...]` (`scripts/rhythm-ablate.ts`) runs the real `OnsetExtractor` and
  `RhythmAnalyzer` over a WAV with `rhythmConfig` constants overridden by an esbuild plugin, so `app/` does not change. It is
  deterministic and an unknown constant is an error, but it leaves out the AGC and block timing of the live chain.
- `npm run probe:rhythm -- <dir> [--write-fixtures <dir>]` (`scripts/rhythm-probe.ts`) prints, for each WAV with a `.bpm` sidecar,
  the Markdown evidence for telling a tempo from its dotted rival. `--write-fixtures` writes the derived onset envelopes that
  `scripts/fixtures/rhythm/` commits; they hold no audio.
  Record them with separate `debug:viz` runs (fresh page loads) or with `--reselect N` (one page, the track chosen again
  each time).

## Notes from implementation
- Telemetry rows are written only while the engine has a source; after a track ends the engine stops and no rows are
  added. The CLI also trims rows after the first backward step in `t`.
- The CLI closes the source dialog once playback starts, so screenshots show the scene.
- Beyond C2, `devTelemetry.ts` exports `getTelemetryView`, `telemetryProbeCount` and `subscribeTelemetryProbes` for
  the overlay (DEV only).
- To make probe values readable, a few visualizer class fields became public and a few new fields store values the code
  already computed (`BassPulse`, `TrioColorWaveSheet`, `DancingCharacterScene`). No maths changed. These assignments
  are in production code, which costs about 0.1 kB.

## Frozen contracts

These were frozen before implementation. Change them only deliberately, and update every consumer in the same change.

### Production budget rules (apply to every contract below)
- The production bundle has almost no headroom (Total JS ~0.3 kB, CSS ~0.2 kB at the time of freezing). The only
  production delta allowed is the C1 engine seam.
- Every DEV-only code path is behind `import.meta.env.DEV` at the call site (`if (import.meta.env.DEV) { ... }`,
  `import.meta.env.DEV && <Jsx/>`, or an `import.meta.env.DEV`-guarded dynamic `import()`), so the production build drops
  the call and the import.
- DEV-only UI must not introduce new Tailwind class names (Tailwind scans all sources, so a new class grows production
  CSS even if the JSX is dropped). Reuse classes that already exist in the codebase, or use inline `style`.
- Production check (AC6): after `npm run build`, `grep -rE "__vizTelemetry|bassRaw|Play a file|Audio file|devFileSource|devTelemetry" build/client`
  finds nothing and `npm run size` passes.

### C1 AudioEngine source seam (production) and DEV file source
`app/features/audio/types.ts`:
```ts
// What a source opener hands the engine: the node that feeds the gain stage and raw meter, plus how to free it.
export interface SourceInput {
    node: AudioNode;
    stop: () => void; // frees the source (stops stream tracks, or stops/disconnects buffer nodes)
    stream?: MediaStream; // present for capture sources; used by trackInfo and latencyInfo
    label?: string; // trackInfo text for non-stream sources
}
export type SourceOpener = (context: AudioContext) => SourceInput | Promise<SourceInput>;
```
`AudioGraph` replaces `audioStream: MediaStream` with `input: SourceInput`, and `source` becomes `AudioNode`.

`AudioEngine`:
- `public startSource(open: SourceOpener): Promise<void>` replaces the private `connect(stream)`. It creates and resumes
  a new `AudioContext`, awaits `open(context)` and wires `input.node` exactly as `connect` wired the stream source (into
  the gain node and the raw meter). If anything up to and including the wiring throws or rejects, it stops the opened
  input (if any), closes the new context and rethrows, and the previous graph keeps running untouched. Otherwise it tears
  down the old graph, installs the new one, starts the AGC timer and notifies. The capture methods also stop their
  stream's tracks when `startSource` fails, and save the source only on success.
- `startScreenCapture` / `startDeviceCapture` call `startSource` with an opener that wraps the stream in
  `createMediaStreamSource`, and `stop` stops the stream's tracks. They still call `saveSource` afterward. `startSource`
  itself never calls `saveSource`, so `resumeSavedSource` never resumes a non-capture source.
- `teardown` calls `graph.input.stop()`, disconnects `graph.source`, and closes the context.
- `trackInfo`: stream sources unchanged; non-stream sources return `input.label ?? ''`.
- `latencyInfo`: `captureLatencyMs` is `undefined` for non-stream sources (there is no capture pipeline); everything else
  is unchanged.
- `public getInputNode = () => this.graph?.source` (the pre-gain source node) and
  `public getGain = () => this.graph?.gainNode.gain.value ?? 1` (current AGC gain, read per frame by DEV telemetry).

`app/features/audio/devFileSource.ts` (DEV only, reached only through an `import.meta.env.DEV`-guarded dynamic import):
```ts
export interface FilePlayback {
    readonly label: string;
    readonly duration: number; // seconds
    readonly ended: boolean;
    position(): number; // seconds into the buffer, clamped to [0, duration]
    seek(seconds: number): void; // restarts playback at `seconds` (clamped)
}
export function startFileSource(
    engine: AudioEngine,
    data: ArrayBuffer,
    options?: { label?: string; audible?: boolean; offset?: number }, // audible defaults to true, offset to 0
): Promise<FilePlayback>;
export function getActivePlayback(): FilePlayback | undefined;
```
- Calls `engine.startSource` with an opener that decodes `data` in the given context. A decode failure rejects with the
  one-line message `Couldn't play <label>: unsupported or corrupt audio file.` (and the engine keeps the old source).
- The graph's source node is a `GainNode` bus. Each play or seek creates a new `AudioBufferSourceNode` (no loop) into the
  bus; the old one is stopped with its `onended` ignored. When audible, the bus also connects to `context.destination`
  (pre-gain, so the user hears the track at its own level).
- When the track plays to its end: `ended` becomes true and, if it is still the engine's active source, it calls
  `engine.stopCapture()`.
- `stop` (engine teardown, including a switch to another source) stops the buffer node, disconnects the bus, and clears
  the active playback.

`SourceChooser.tsx`: in DEV only, a third `SourceCard` titled `Play a file (dev only)` with
`<input type="file" accept="audio/*,.mp3,.wav,.flac" aria-label="Audio file">`. Choosing a file runs through the existing
`run` helper: dynamic-import `devFileSource`, `startFileSource(engine, await file.arrayBuffer(), { label: file.name })`,
then `onStarted()`. Errors show in the existing one-line alert.

### C2 Telemetry probe registry (DEV only)
`app/features/audio/devTelemetry.ts`:
```ts
export type TelemetryRead = (out: Float32Array) => void; // writes this probe's columns, in order, from index 0
export function registerTelemetryProbe(name: string, columns: readonly string[], read: TelemetryRead): () => void;
export function tickTelemetry(dtSeconds: number): void;
export function attachTelemetry(engine: AudioEngine): () => void; // installs window.__vizTelemetry; returns detach
```
- All three are no-ops outside DEV. Scenes call them only inside `if (import.meta.env.DEV)`.
- A scene registers in its `useThreeScene` setup and unregisters in the returned `dispose`. The probe's `read` closure is
  created once and must not allocate.
- Scenes call `tickTelemetry(delta / 1000)` at the end of their `update`, after their own maths. One row per tick.
- Row layout: `t, dt, fps, bassRaw, bassPost, gain`, then each registered probe's columns as `<name>.<column>` in
  registration order. `t` = `getActivePlayback()?.position()` when a file is playing, else the analyser context's
  `currentTime`. `dt` in seconds, `fps` = `1 / dt` (0 when `dt` is 0). `bassRaw` / `bassPost` = mean byte frequency
  magnitude / 255 over bins up to 120 Hz, from two DEV-only analysers (fftSize 4096, smoothing 0) connected in parallel
  from `engine.getInputNode()` (pre-gain) and `engine.getAnalyser()` (post-gain), rebound when the engine's graph
  changes and disconnected on detach. `gain` = `engine.getGain()`.
- Storage is one preallocated row-major `Float32Array` sized `capacitySeconds * 120` rows (default 600 s). When full it
  stops recording and sets `overflowed`; it never overwrites. Registering or unregistering a probe resets the rows
  (the column layout changed).
- Probe names and columns. Every probe has an `in` column (the bass value the visualizer reads) and an `out` column (the
  bass-driven value it renders); the summary relies on those two names.
  - `cubes`: `in` (BassPulse bass RMS energy), `fast`, `slow`, `ratio`, `out` (BassPulse output).
  - `trio-color-wave`: `in` (bass sheet frame level before balancing), `peak` (its decaying peak), `out` (bass level
    after balancing).
  - `dancing-character`: `in` (bass input to the gate), `out` (gate output), `gateOpen`, `gateScore`, `gateWeight`,
    `tempoLocked` (booleans as 0/1), then the tempo columns of C5.

### C3 Window telemetry hook (DEV only)
Installed by `attachTelemetry`, removed on detach:
```ts
window.__vizTelemetry = {
    readonly columns: string[];
    readonly rowCount: number;
    readonly overflowed: boolean;
    snapshot(): Float32Array; // copy of the recorded rows, row-major, rowCount * columns.length
    reset(capacitySeconds?: number): void; // clears rows; optionally resizes capacity
    playback(): { position: number; duration: number; ended: boolean } | null; // the active file playback
    seek(seconds: number): void; // seeks the active file playback (no-op without one)
};
```
`DevTelemetryOverlay` (`app/components/DevTelemetryOverlay.tsx`) is mounted once in `app/root.tsx` through an
`import.meta.env.DEV`-guarded `React.lazy` import. It calls `attachTelemetry(useAudio())` in an effect, and while a probe
is registered it shows the latest row's bassRaw, bassPost, gain, fps and the probe's `in`/`out` as numbers, plus a small
canvas sparkline of `in` and `out`. It refreshes on a timer, not React state per frame, reads through refs, and is
`aria-hidden`. It renders nothing when no probe is registered.

### C4 CLI, CSV and summary
`app/features/audio/devTelemetrySummary.ts` (pure, no DOM):
```ts
export interface TelemetryTable { columns: string[]; rows: number[][] }
export function formatTelemetryCsv(columns: readonly string[], data: ArrayLike<number>, rowCount: number): string;
export function parseTelemetryCsv(text: string): TelemetryTable; // throws a one-line Error on a malformed file
export interface SummaryOptions { windowSeconds?: number; dropThreshold?: number; minFps?: number; maxLines?: number }
export function summarizeTelemetry(table: TelemetryTable, options?: SummaryOptions): string[];
```
- CSV: a header line of column names, then one line per row, values written with at most 5 significant digits.
- Summary defaults: `windowSeconds` 5, `dropThreshold` 0.5, `minFps` 50, `maxLines` 60. It uses the first `<name>.in` /
  `<name>.out` pair in the columns. Per window by `t`: mean bassRaw, mean in, mean out, ratio = mean out / mean in (blank
  when mean in is near zero), mean gain, mean fps. The baseline is the first reliable window with a ratio. A reliable
  window whose ratio is below `(1 - dropThreshold) * baseline` is flagged `FALLOFF`; a window with mean fps under
  `minFps` is marked `unreliable` and never flagged. If the windows would not fit in `maxLines` with the header lines,
  the window is widened. Total output never exceeds `maxLines` lines.

`scripts/debug-visualizer/run.ts`, run as
`npm run debug:viz -- --dir <folder> --track <file> --viz <name> [--seconds N] [--from T] [--shots t1,t2] [--headless]`:
- `--viz` is one of the paths in `app/features/landing/visualizations.ts` without the slash. Starts `react-router dev`
  on a free port, waits for it, launches Chromium (headed unless `--headless`) with
  `--autoplay-policy=no-user-gesture-required`, opens `/<viz>`, uploads the track through the `Audio file` input with
  `setInputFiles`, seeks to `--from`, resets the recorder with the clamped duration, waits until playback reaches
  `from + seconds` (or ends), takes `shot-<t>.png` as playback passes each requested shot time, then writes
  `.debug-out/<viz>-<track>-<stamp>/telemetry.csv` and prints the run parameters, the row count, the measured fps and
  the summary. The dev server and the browser are always stopped in a `finally`.
- Errors exit non-zero with a one-line reason: missing or empty folder, unknown track (it lists the audio files found),
  unknown visualizer, decode failure (the alert text). `--seconds` past the end is clamped (reported); shots past the
  end are reported as skipped.
- A recording is at most 600 s: an explicit `--seconds` that would record more than 600 s of the track is an error (record a long track in parts with
  `--from`); without `--seconds` a longer remainder is recorded for 600 s and the Run line says so. The recorder is
  sized for 240 Hz displays.
- A run fails as stalled when the playback position stops advancing for 15 s. Ctrl+C (exit 130) or SIGTERM (143)
  stops the dev server and browser within about 5 s; a second signal exits at once.
- `npm run debug:summary -- <csv>` (`scripts/debug-visualizer/summarize.ts`) reprints the summary of a CSV.
- `.debug-out/` is git-ignored.

### C5 Tempo telemetry and reports
Added for the rhythm stability work. Everything here stays DEV-only or outside the app bundle, except the read-only
accessors named below.

**Probe columns.** The `dancing-character` probe's columns are, in this exact order, the six in C2 followed by:

| Column | Value |
|---|---|
| `bpm` | `rhythm.state.bpm` |
| `rawBeatBpm` | `60 / beat period` from the analyzer's `BeatTracker`, 0 without a grid |
| `rawTempoBpm` | `TempoTracker.rawBpm`: the latest estimate before hysteresis |
| `heldTempoBpm` | `TempoTracker.bpm`: the held tempo that drives the beat grid |
| `tempoConfidence`, `meterConfidence` | from `rhythm.state` |
| `beatsPerBar`, `beatPhase`, `barPhase` | from `rhythm.state`, NaN while undefined |
| `beatCount`, `songChanges` | `rhythm.state.beatCount`, `rhythm.state.songChangeCount` |
| `gridEpoch` | the analyzer's grid epoch (back to 0 on a hard reset) |
| `timeScale`, `phaseNudge`, `meterLocked` | the scene's latest `computeDanceTiming` result and state (0/1), read after its update |
| `clipPhase` | the position in the dance loop, 0..1, the value passed to `computeDanceTiming` this frame; 0 before a rig is loaded |
| `bumpCount` | new monotonic `BassGateState.bumpCount`, raised each time a bump starts |
| `kickPhaseOffset` | new `BassGateState.kickOffset`: the latest kick's signed distance from the learned place, in beats, (-0.5, 0.5], NaN until one was measured |
| `rivalBpm` | `TempoTracker.rivalBpm`: the latest estimate's strongest rival pulse, 0 when it has none. Recordings made before this column still load |

`rawBeatBpm`, `rawTempoBpm`, `heldTempoBpm`, `rivalBpm` and `gridEpoch` are read-only getters of those names on `RhythmAnalyzer`.
`RhythmTracker` exposes the current analyzer through one read-only getter, `analysis`, which is `undefined` before a bind.
The new gate fields are written only, never read by the gate's own logic, so its output does not change. `read` must not
allocate. These are the only production changes, and the bundle delta is measured with `npm run size` in the same pull
request.

**Sidecar.** `run.ts` looks for `<dir>/<track without extension>.bpm`. When it exists, the number is written to
`<outDir>/track.bpm` so the output folder stays self-contained. `debug:summary` takes the reference from `--bpm`, else a
`track.bpm` beside the CSV, else there is none. A sidecar that does not parse prints one warning line and counts as none.

**Pure report functions** (no DOM or node APIs; exported for specs) live in `scripts/debug-visualizer/`, outside the app
bundle.

`tempoReport.ts`:

```ts
export function parseBpmSidecar(text: string): number | undefined; // first whitespace token; finite and above 0, else undefined
export function normalizeOctave(bpm: number, reference: number): number; // bpm * 2^round(log2(reference / bpm)); 0 stays 0
export interface TempoSummaryOptions {
    referenceBpm?: number;
    windowSeconds?: number; // default 5
    tolerance?: number; // default 0.01
    lockHoldSeconds?: number; // default 2
    minFps?: number; // default 50
    maxLines?: number; // default 40
}
export interface TempoMetrics {
    lockTime: number | undefined; // first t at which tempoLocked has held 1 for lockHoldSeconds; post-lock starts here
    medianBpm: number; // post-lock, of the bpm column; NaN when never locked
    withinTolerance: number | undefined; // post-lock share of rows, octave-normalized; undefined without a reference
    songChanges: number; // rises of songChanges within the recording, so a re-select before the first row never counts
    gridRebuilds: number; // rises of gridEpoch within the recording
    lockedShare: number; // post-lock share of rows with tempoLocked = 1
    gateShare: number; // share of rows with gateOpen = 1, from the gate's first opening on; 0 when it never opens
    gateOpenTime: number | undefined; // first post-lock t with gateOpen = 1
    gateOpenDelay: number | undefined; // seconds from lockTime to gateOpenTime
    bumpIntervalShare: number | undefined; // post-lock intervals within 0.1 beat of a whole number of beats (at least 1)
    meanFps: number;
}
export function computeTempoMetrics(table: TelemetryTable, options?: TempoSummaryOptions): TempoMetrics | undefined;
export function summarizeTempo(table: TelemetryTable, options?: TempoSummaryOptions): string[];
```

- Columns are found by the first name ending in `.bpm`; its prefix locates the others. A table without one returns
  `undefined` from `computeTempoMetrics`, and one line saying so from `summarizeTempo`.
- `summarizeTempo` prints one line per window by `t` (mean, min and max bpm; largest octave-normalized deviation in
  percent and the share of rows in tolerance when there is a reference; mean `rawTempoBpm`, min `tempoConfidence`, rises
  of `songChanges` and `gridEpoch`, locked and gate shares, bumps, and `unreliable` under `minFps`), one line per song
  change and per grid rebuild with its `t`, the `TempoMetrics` values, and a last line that is one of
  `TEMPO VERDICT: PASS`, `TEMPO VERDICT: FAIL (<which target>)` or `TEMPO VERDICT: report only (no sidecar)`. Pass means
  `withinTolerance` at least 0.98, no song changes, no grid rebuilds, `lockedShare` at least 0.99, a `gateOpenDelay` of at most 4 s, `gateShare` at least 0.99 and `bumpIntervalShare` at least 0.95. A recording that never locks fails. Windows are widened to fit `maxLines`, and the
  output never exceeds it.
- `debug:viz` and `debug:summary` print `summarizeTelemetry` with `maxLines: 20`, then `summarizeTempo` with its default,
  so the total stays within the 60 lines above. A probe without the columns adds only the one line.

`repeatReport.ts`:

```ts
export interface RepeatTargets { bpmPercent: number; beatMs: number; clipLoops: number; lockSeconds: number } // defaults 1, 40, 0.05, 2
export interface RepeatSpread { median: number; p95: number; max: number }
export interface RepeatComparison {
    runs: number;
    lockTimes: (number | undefined)[];
    meterLockTimes: (number | undefined)[]; // first meter lock after each run's tempo lock; undefined when there is none
    medianBpms: number[];
    sameOctave: boolean;
    samples: number;
    // Each is the spread across runs at one sample time, summarized over all samples.
    bpmPercent: RepeatSpread;
    beatMs: RepeatSpread;
    clipLoops: RepeatSpread;
    lockSeconds: number; // Infinity when a run never locked
}
export function compareRuns(tables: readonly TelemetryTable[]): RepeatComparison;
export function formatRepeatReport(comparison: RepeatComparison, targets?: Partial<RepeatTargets>): string[];
```

- Sample times are every 0.25 s of `t` from the latest run's meter lock (its `lockTime` if no run has one, because a dance cannot align to a bar before the bar is known) to the earliest run's end; each run uses its last
  row at or before the sample with a defined `beatPhase` and `bpm > 0`. With no sample time, the spreads are NaN and the
  verdict fails.
- A beat time is `t - beatPhase * 60 / bpm`, so frame rate does not limit it. Beat times and `clipPhase` are compared
  around a circle (one beat, at the first run's median period, and one loop), and the spread is the smallest arc holding
  every run. `bpmPercent` is `(max - min) / mean` of the values, octave-normalized to the first run.
- `sameOctave` compares `round(log2(medianBpm / first run's medianBpm))`; when false the beat spread is NaN and the report
  says so.
- The last line is `REPEAT VERDICT: PASS` when `sameOctave` holds and each `p95` and `lockSeconds` is within its target,
  else `REPEAT VERDICT: FAIL (<which target>)`. Fewer than two tables throws a one-line Error.

**Commands.**

- `scripts/debug-visualizer/repeat.ts` is `npm run debug:repeat -- <a.csv> <b.csv> [...] [--bpm N]`. `--bpm` is used only for
  a line per run giving its median's octave-normalized deviation.
- `debug:viz` gains `--reselect N` (a whole number, at least 1, default 1): play the track N times in one page, choosing it
  again in the source dialog each time, each play with its own output folder and summary. `--reselect` above 1 with
  `--shots` is an error.
- With `--from 0` the harness no longer seeks after the upload, because restarting the track a moment after it began feeds
  the tracker a discontinuity of a different length on every run. It resets the recorder only, so the first row's `t` is
  slightly above 0.
