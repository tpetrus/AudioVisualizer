import type { BeatSidecar, OnsetBand } from '../../app/features/rhythm/eval/evalTypes';
import { createRandom } from '../../app/features/rhythm/testSignals';

// Renders synthetic tracks whose beat and onset times are known exactly, plus the sidecar that records them (contract
// C1). Pure and deterministic: noise comes from a seeded generator, and nothing here touches the file system, so specs
// and the CLI (generate.ts) share it. Not part of the app bundle.

export const GROUND_TRUTH_SAMPLE_RATE = 44100;

// Seconds of silence before the first beat, so the tracker's first frames see a clean start.
const FIRST_BEAT_SECONDS = 0.5;
// Beats and onsets this close to the end are left out of the truth: a hit cut off by the end of the audio is not
// something a detector can be asked to find.
const END_MARGIN_SECONDS = 0.3;
// Times in the sidecar are rounded to microseconds so the committed files do not depend on floating point noise.
const TIME_DECIMALS = 1e6;

// What a hit sounds like. The voices occupy different parts of the spectrum so the pipeline's bands can tell them apart.
export type Voice = 'click' | 'kick' | 'bass' | 'snare' | 'highs' | 'pad' | 'lead';

// Voices that are distractors: they sound in the audio but are never onsets, so they have no band and add no labels.
const DISTRACTORS: ReadonlySet<Voice> = new Set<Voice>(['pad', 'lead']);

// The band each voice is an onset of in the sidecar. A click is a short mid-frequency tone, which the pipeline's mid
// band hears, and the evaluation maps that band to `snare`.
const VOICE_BAND: Record<Exclude<Voice, 'pad' | 'lead'>, OnsetBand> = {
    click: 'snare',
    kick: 'kick',
    bass: 'bass',
    snare: 'snare',
    highs: 'highs',
};

export interface Hit {
    voice: Voice;
    // Position in the bar in beats (0 is the downbeat).
    beat: number;
    // 0..1, relative to the voice's own full level.
    level: number;
    // Fundamental in Hz of a pitched bass note or lead note. A bass hit without it keeps the original fixed 110 Hz note.
    pitchHz?: number;
    // How long a pad or lead note sounds, in beats (a pad is a whole bar). Ignored by the percussive voices.
    lengthBeats?: number;
}

export interface TrackSpec {
    name: string;
    // The tempo label of the sidecar: the beat the music is meant to be felt in.
    bpm: number;
    seconds: number;
    // The hits of one bar of `beatsPerBar` beats, repeated for the whole track.
    beatsPerBar: number;
    pattern: readonly Hit[];
    // The notes in Hz of the pad chord of each bar, cycling through the list. Only used by tracks with a pad.
    chords?: readonly (readonly number[])[];
}

const hits = (voice: Voice, beats: readonly number[], level = 1): Hit[] =>
    beats.map((beat) => ({ voice, beat, level }));

const everyHalfBeat = Array.from({ length: 8 }, (_, i) => i / 2);

// Kick on 1 and 3, snare on 2 and 4, a hi-hat on every eighth and syncopated bass notes between the kicks.
function drumPattern(): Hit[] {
    return [
        ...hits('kick', [0, 2]),
        ...hits('snare', [1, 3]),
        ...hits('highs', everyHalfBeat, 0.6),
        ...hits('bass', [0.5, 2.5, 3.5], 0.8),
    ];
}

const TRACK_SECONDS = 30;

function track(name: string, bpm: number, pattern: readonly Hit[], chords?: readonly (readonly number[])[]): TrackSpec {
    return { name, bpm, seconds: TRACK_SECONDS, beatsPerBar: 4, pattern, ...(chords ? { chords } : {}) };
}

// Fundamentals in Hz of the notes the new tracks use.
const NOTE_HZ = { E1: 41.2, A1: 55, B1: 61.74, D2: 73.42, F2: 87.31, G2: 98 } as const;

// A drum groove (kick, snare, hi-hat) under sustained pad chords that change every bar and a legato vibrato lead in the
// mid band. The pad and lead have slow attacks and are not onsets, so the sidecar lists only the drums.
function padLeadPattern(): Hit[] {
    const lead = [880, 987.8, 1046.5, 1174.7];
    return [
        ...hits('kick', [0, 2]),
        ...hits('snare', [1, 3]),
        ...hits('highs', everyHalfBeat, 0.6),
        { voice: 'pad', beat: 0, level: 0.5, lengthBeats: 4 },
        ...lead.map((pitchHz, i): Hit => ({ voice: 'lead', beat: i, level: 0.35, pitchHz, lengthBeats: 1.1 })),
    ];
}

// Pitched bass notes from E1 to G2 on the offbeats beside a kick on every beat.
function bassLinePattern(): Hit[] {
    const notes = [NOTE_HZ.E1, NOTE_HZ.A1, NOTE_HZ.D2, NOTE_HZ.G2];
    const steps = [NOTE_HZ.B1, NOTE_HZ.F2];
    return [
        ...hits('kick', [0, 1, 2, 3]),
        ...notes.map((pitchHz, i): Hit => ({ voice: 'bass', beat: i + 0.5, level: 0.9, pitchHz })),
        ...steps.map((pitchHz, i): Hit => ({ voice: 'bass', beat: i * 2 + 0.75, level: 0.7, pitchHz })),
    ];
}

export const GROUND_TRUTH_TRACKS: readonly TrackSpec[] = [
    // Clicks on every beat: the plainest beat there is, and the signal a tap-along measures its tapper against.
    ...[90, 120, 140, 174].map((bpm) => track(`click-${bpm}`, bpm, hits('click', [0, 1, 2, 3]))),
    ...[100, 128, 150].map((bpm) => track(`drums-${bpm}`, bpm, drumPattern())),
    // Loud kicks every 3 sixteenths (3-3-3-3-4 over the bar) over quiet clicks on the true beats: the accents repeat at
    // 4/3 of the labelled tempo, the dotted rival.
    track('trap-4to3-120', 120, [...hits('kick', [0, 0.75, 1.5, 2.25, 3]), ...hits('click', [0, 1, 2, 3], 0.3)]),
    // Loud kicks on every half beat over quiet clicks on the beats: the accents repeat at twice the labelled tempo.
    track('trap-2to1-double-90', 90, [...hits('kick', everyHalfBeat), ...hits('click', [0, 1, 2, 3], 0.3)]),
    // Loud kicks only on 1 and 3 with the beats between them marked only by quiet hi-hats: the accents repeat at half
    // the labelled tempo.
    track('trap-2to1-half-140', 140, [...hits('kick', [0, 2]), ...hits('highs', [0, 1, 2, 3], 0.3)]),
    // The same groove with the kick taken out: only snare, hi-hat and syncopated bass carry it.
    track('no-kick-124', 124, [
        ...hits('snare', [1, 3]),
        ...hits('highs', everyHalfBeat, 0.6),
        ...hits('bass', [0, 1.5, 2, 3.5], 0.8),
    ]),
    // Drums over slow pad chords and a vibrato lead: the pad and lead are distractors with no onset labels.
    track('pad-lead-groove-110', 110, padLeadPattern(), [
        [220, 261.6, 329.6],
        [174.6, 220, 261.6],
        [196, 261.6, 329.6],
        [196, 246.9, 293.7],
    ]),
    // A pitched bassline (E1 to G2) beside a kick on the beats: bass notes are bass onsets, kicks are kick onsets.
    track('bassline-kick-120', 120, bassLinePattern()),
];

// Filters `signal` in place with a second-order section (RBJ cookbook coefficients).
function biquad(signal: Float32Array, kind: 'bandpass' | 'highpass', hz: number, q: number, sampleRate: number): void {
    const w = (2 * Math.PI * hz) / sampleRate;
    const alpha = Math.sin(w) / (2 * q);
    const cos = Math.cos(w);
    const a0 = 1 + alpha;
    const b = kind === 'bandpass' ? [alpha, 0, -alpha] : [(1 + cos) / 2, -(1 + cos), (1 + cos) / 2];
    const a1 = (-2 * cos) / a0;
    const a2 = (1 - alpha) / a0;
    let x1 = 0;
    let x2 = 0;
    let y1 = 0;
    let y2 = 0;
    for (let i = 0; i < signal.length; i++) {
        const x0 = signal[i];
        const y0 = (b[0] * x0 + b[1] * x1 + b[2] * x2) / a0 - a1 * y1 - a2 * y2;
        signal[i] = y0;
        x2 = x1;
        x1 = x0;
        y2 = y1;
        y1 = y0;
    }
}

// A pad chord or a lead note: slow attack, no transient, so nothing in it is an onset. The lead has a 5.5 Hz vibrato and
// overlaps its neighbor a little (legato).
function renderSustained(
    voice: 'pad' | 'lead',
    sampleRate: number,
    hit: Hit,
    beatSeconds: number,
    chord: readonly number[],
): Float32Array {
    const attack = voice === 'pad' ? 0.4 : 0.15;
    const release = 0.25;
    const body = (hit.lengthBeats ?? 1) * beatSeconds;
    const out = new Float32Array(Math.round((body + release) * sampleRate));
    const notes = voice === 'pad' ? chord : [hit.pitchHz ?? 1000];
    const phases = notes.map(() => 0);
    for (let i = 0; i < out.length; i++) {
        const t = i / sampleRate;
        const envelope = Math.min(1, t / attack) * Math.min(1, (body + release - t) / release);
        const vibrato = voice === 'lead' ? 1 + 0.015 * Math.sin(2 * Math.PI * 5.5 * t) : 1;
        let sum = 0;
        for (let n = 0; n < notes.length; n++) {
            phases[n] += (2 * Math.PI * notes[n] * vibrato) / sampleRate;
            sum += Math.sin(phases[n]) + 0.3 * Math.sin(2 * phases[n]);
        }
        out[i] = (voice === 'pad' ? 0.25 : 0.5) * envelope * (sum / notes.length);
    }
    return out;
}

// One hit as its own short buffer, starting at its first sample. Level is applied by the caller.
function renderVoice(
    voice: Voice,
    sampleRate: number,
    random: () => number,
    hit: Hit,
    beatSeconds: number,
    chord: readonly number[],
): Float32Array {
    const seconds: Record<Voice, number> = {
        click: 0.04,
        kick: 0.3,
        bass: 0.3,
        snare: 0.2,
        highs: 0.08,
        pad: 0,
        lead: 0,
    };
    if (voice === 'pad' || voice === 'lead') return renderSustained(voice, sampleRate, hit, beatSeconds, chord);
    const out = new Float32Array(Math.round(seconds[voice] * sampleRate));
    let phase = 0;
    for (let i = 0; i < out.length; i++) {
        const t = i / sampleRate;
        switch (voice) {
            case 'click':
                out[i] = 0.6 * Math.exp(-t / 0.006) * Math.sin(2 * Math.PI * 1000 * t);
                break;
            case 'kick':
                // A short sine sweeping from about 100 Hz down to 45 Hz, the low thump of a kick drum.
                phase += (2 * Math.PI * (45 + 55 * Math.exp(-t / 0.03))) / sampleRate;
                out[i] = 0.8 * Math.exp(-t / 0.07) * Math.sin(phase);
                break;
            case 'bass': {
                // A sustained note a little above the kick's final pitch: 5 ms attack, 60 ms release.
                const attack = Math.min(1, t / 0.005);
                const release = Math.min(1, (seconds.bass - t) / 0.06);
                const hz = hit.pitchHz;
                // A pitched note carries its harmonics so the pitch is clear on small speakers; the original note is
                // left exactly as it was.
                const wave =
                    hz === undefined
                        ? Math.sin(2 * Math.PI * 110 * t) + 0.3 * Math.sin(2 * Math.PI * 220 * t)
                        : Math.sin(2 * Math.PI * hz * t) +
                          0.4 * Math.sin(2 * Math.PI * 2 * hz * t) +
                          0.2 * Math.sin(2 * Math.PI * 3 * hz * t);
                out[i] = 0.35 * attack * release * wave;
                break;
            }
            case 'snare':
            case 'highs':
                out[i] = random() * 2 - 1;
                break;
        }
    }
    if (voice === 'snare') {
        // Noise limited to the mid band, with a 50 ms decay.
        biquad(out, 'bandpass', 1200, 0.7, sampleRate);
        for (let i = 0; i < out.length; i++) out[i] *= 0.9 * Math.exp(-i / sampleRate / 0.05);
    } else if (voice === 'highs') {
        // Noise above 6 kHz with a 12 ms decay, the tick of a closed hi-hat.
        biquad(out, 'highpass', 6000, 0.7, sampleRate);
        for (let i = 0; i < out.length; i++) out[i] *= 0.5 * Math.exp(-i / sampleRate / 0.012);
    }
    return out;
}

const round = (time: number): number => Math.round(time * TIME_DECIMALS) / TIME_DECIMALS;

export interface RenderedTrack {
    pcm: Float32Array;
    sidecar: BeatSidecar;
}

// Mono PCM and the matching sidecar for one track. The sidecar's `track` is `<name>.wav`.
export function renderGroundTruthTrack(spec: TrackSpec, sampleRate = GROUND_TRUTH_SAMPLE_RATE): RenderedTrack {
    const pcm = new Float32Array(Math.round(spec.seconds * sampleRate));
    const beatSeconds = 60 / spec.bpm;
    const barSeconds = beatSeconds * spec.beatsPerBar;
    const lastTime = spec.seconds - END_MARGIN_SECONDS;
    const random = createRandom(1);
    const onsets: Record<OnsetBand, number[]> = { kick: [], bass: [], snare: [], highs: [] };
    const beats: number[] = [];

    for (let bar = 0; FIRST_BEAT_SECONDS + bar * barSeconds < lastTime; bar++) {
        const barStart = FIRST_BEAT_SECONDS + bar * barSeconds;
        for (let beat = 0; beat < spec.beatsPerBar; beat++) {
            if (barStart + beat * beatSeconds < lastTime) beats.push(round(barStart + beat * beatSeconds));
        }
        for (const hit of spec.pattern) {
            const time = barStart + hit.beat * beatSeconds;
            if (time >= lastTime) continue;
            if (!DISTRACTORS.has(hit.voice)) onsets[VOICE_BAND[hit.voice as keyof typeof VOICE_BAND]].push(round(time));
            const chord = spec.chords ? spec.chords[bar % spec.chords.length] : [];
            const voice = renderVoice(hit.voice, sampleRate, random, hit, beatSeconds, chord);
            const start = Math.round(time * sampleRate);
            for (let i = 0; i < voice.length && start + i < pcm.length; i++) pcm[start + i] += hit.level * voice[i];
        }
    }
    // A pattern's hits are not listed in time order within a bar.
    for (const band of Object.keys(onsets) as OnsetBand[]) onsets[band].sort((a, b) => a - b);

    // Keep the loudest overlap of voices clear of clipping, the same for every run.
    let peak = 0;
    for (let i = 0; i < pcm.length; i++) peak = Math.max(peak, Math.abs(pcm[i]));
    if (peak > 0.95) {
        for (let i = 0; i < pcm.length; i++) pcm[i] *= 0.95 / peak;
    }

    return {
        pcm,
        sidecar: { track: `${spec.name}.wav`, tempo: spec.bpm, beats, onsets, source: 'synthetic', tapOffsetMs: 0 },
    };
}
