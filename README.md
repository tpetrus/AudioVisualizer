# AudioVisualizer

Audio-reactive 3D visualizations that run entirely in the browser. You pick an audio source, either whatever your
computer is playing (screen or tab audio) or an input device such as Stereo Mix, and each visualizer draws a
[three.js](https://threejs.org/) scene that moves with the music. There is no server and nothing is uploaded; the audio
never leaves your machine.

It started as an Angular app and was ported to React. It is built to run smoothly on computers with weak or no graphics
cards, so the music analysis (including the rhythm tracking described below) is plain signal processing, not machine
learning.

## Visualizations

| Name | Route | What you see |
|---|---|---|
| **Cubes** | `/cubes` | A wall of glass cubes. Each column of cubes is one slice of the sound, with deep bass in the middle and treble toward the edges. Louder sound pushes the cubes in that column toward you, turning and brightening them like a level meter. A bass hit makes the whole backdrop flash and rise, and a confident first beat of a bar adds a small extra lift. |
| **Trio color wave** | `/trio-color-wave` | Three rows of pencil-shaped bars, one row each for highs, mids and bass, stacked front to back. Each bar's height is how loud its pitch is. A hit ripples backward through the rows, and each row is colored along its length from low pitches to high. |

Both have a control panel for sensitivity, colors, smoothing and more. Open "Audio settings" there to
change the audio source or the volume normalization. Two optional overlays can be switched on from the same panel:
**performance stats** and **rhythm stats** (BPM, meter, beat position, song-change flash).

## What the audio gives you

Everything below is available to a visualizer today. The first group is the raw sound; the second is what the rhythm
tracker works out from it.

### The sound itself (`useAnalyser()` and the audio engine)

| Data | In plain terms |
|---|---|
| **Spectrum** (`getByteFrequencyData`) | A row of bars like a stereo's equalizer: how loud each pitch is right now, from deep bass to high hiss. 0 is silent, 255 is as loud as it gets. |
| **Waveform** (`getByteTimeDomainData`, `getFloatTimeDomainData`) | The actual wobble of the sound over the last few milliseconds. Its swing up and down is the volume; its shape tells you how raw or smooth the sound is. |
| **Level** (`engine.getLevel()`) | One number from 0 to 1: how loud the music is right now, as it comes in from your computer. |
| **Output level** (`engine.getOutputLevel()`) | The same, after the app evens out loud and quiet songs. This is the volume the visualizers actually see. |
| **Silent** (`useLevelMeter().silent`) | True when nothing has played for about four seconds. Handy for an idle or "waiting for music" look. |
| **Band levels** (`createBandBins`, `updateBandLevels`) | The spectrum squashed into a few columns of evenly spaced pitches, with a noise gate and smoothing. Cubes uses this. |
| **Bass pulse** (`BassPulse`) | A 0 to 1 "thump" that jumps when the bass gets louder than it has recently been, and not when the whole mix is just loud. It works at any volume. |
| **Sample rate and latency** (`engine.latencyInfo`) | Technical details about the capture: how finely the sound is measured and how far behind real time it runs. |
| **Track info** (`engine.trackInfo`) | The name and state of the audio source that is being captured. |

### Rhythm (`useRhythm()`, read from `tracker.state`)

Call `tracker.updatePhase()` once per animation frame, then read the values from `tracker.state`. The values are
refreshed in place, so there is nothing to allocate or subscribe to.

| Data | In plain terms |
|---|---|
| **`bpm`** | The speed of the song in beats per minute (how fast you would tap your foot). 0 means it has not worked it out yet. |
| **`tempoConfidence`** | 0 to 1: how sure it is about the BPM. |
| **`beatPhase`** | 0 to 1: how far you are between one beat and the next. 0 is the instant of a beat; 0.5 is halfway to the next. Use it for smooth pulses that stay in time. It is empty (`undefined`) until the first beat is found, so check for that before using it. |
| **`beatCount`** | A running total of beats heard. Remember the last value you saw; if it changed, a beat just happened. |
| **`beatsPerBar`** | 3 or 4: whether the music counts in threes (a waltz) or fours (most pop and rock). `undefined` means it cannot tell. |
| **`meterConfidence`** | 0 to 1: how sure it is about the 3 or 4. Only trust it above about 0.5 (`METER_VISUAL_CONFIDENCE`). |
| **`barPhase`** | 0 to 1: how far through the current bar of 3 or 4 beats you are. It is empty (`undefined`) while the meter is unsure, so check for that before using it. |
| **`downbeatCount`** | A running total of the "ONE" beats, the strong first beat of each bar. Same compare-with-last-value trick as `beatCount`. It only advances when the meter is confident. |
| **`nextBeatTime`** | When the next beat will land, in the audio clock's seconds. Lets you start a movement early so it arrives on the beat. |
| **`bandOnsets`** | Three 0 to 1 numbers (kick, mid, high) that spike when a drum-like hit lands in that range, then fade. Kick is the thud, mid is snares and vocals, high is hats and cymbals. |
| **`chroma`** | Twelve numbers, one per note of the scale (C, C♯, D … B), showing which notes are sounding most, whatever the octave. Good for coloring by key or chord. |
| **`novelty`** | 0 to 1: how different the last few seconds sound from the minute before. It spikes on a drop, a new section or a new song. |
| **`songChangeCount`** | A running total of detected song or section changes. When it goes up, re-randomize something. |

There is also a React hook for slow-moving values: `useBeatsPerBar()` and `useSongChangeCount()` re-render a component
only when the meter flips or a song change is detected. Never put per-frame values in React state.

**How much to trust the rhythm data.** Tempo and beat timing are dependable on music with a clear beat. The 3-or-4
decision needs roughly 10 to 20 seconds of listening, and the first beat of the bar is the least certain part of it.
When the tracker is unsure it says so (`beatsPerBar` is `undefined`) instead of guessing. The unit tests use generated
drum tracks, so how it fares on real recordings is still to be measured. `npm run eval:rhythm -- <dataset-dir>` does
that on labelled audio, such as the Ballroom dataset, which includes waltzes.

## Getting started

```bash
npm install
npm run dev        # http://localhost:5173
```

Open the site, choose an audio source in the dialog, then pick a visualization. In Chrome or Edge, screen capture needs
"Share system audio" ticked in the share picker. Alternatively, choose an input device such as Stereo Mix or a
virtual audio cable.

| Task | Command |
|---|---|
| Dev server (hot reload) | `npm run dev` |
| Type-check | `npm run typecheck` |
| Unit tests | `npm run test` |
| Rhythm accuracy on labelled WAVs | `npm run eval:rhythm -- <dataset-dir>` |
| Production build | `npm run build` |
| Serve the build locally like production | `npm run preview` |
| Deploy to Cloudflare | `npm run deploy` |

## How it is built

React 19 and React Router 8 (single-page app), three.js 0.141 (pinned, so do not upgrade it casually), the Web Audio
API, Tailwind CSS 4 and TypeScript. It is deployed as static files on Cloudflare Workers.

The audio engine, the rhythm tracker and the three.js scenes are plain classes and functions outside React; components
only wire them up. If you are adding or changing code, start with [`AGENTS.md`](AGENTS.md), which links to the
architecture notes, the code conventions and a step-by-step guide for adding a new visualizer.
