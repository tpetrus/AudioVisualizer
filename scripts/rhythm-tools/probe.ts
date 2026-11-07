import { TEMPO_UPDATE_SECONDS } from '../../app/features/rhythm/rhythmConfig';
import { TempoTracker } from '../../app/features/rhythm/tempo';
import {
    correlateWindow,
    estimateTempo,
    interpolatedPeak,
    tempoGeometry,
    type Correlation,
    type TempoGeometry,
} from './autocorrelation';
import type { OnsetSeries } from './onset';

// One tempo update of the real TempoTracker: what it said after `frames` envelope values.
export interface TrackerStep {
    frames: number;
    time: number;
    raw: number;
    held: number;
    confidence: number;
    rival: number;
}

// Feeds the combined onset series to a real TempoTracker, asking for an estimate on the analyzer's cadence. This is the
// tracker alone: the analyzer's song-boundary resets are not applied, so a held tempo here can outlive a real reset.
export function replayTracker(combined: ArrayLike<number>, frameRate: number): TrackerStep[] {
    const tracker = new TempoTracker(frameRate);
    const updateFrames = Math.max(1, Math.round(TEMPO_UPDATE_SECONDS * frameRate));
    const steps: TrackerStep[] = [];
    for (let i = 0; i < combined.length; i++) {
        tracker.push(combined[i]);
        if ((i + 1) % updateFrames === 0 && tracker.update()) {
            steps.push({
                frames: i + 1,
                time: (i + 1) / frameRate,
                raw: tracker.rawBpm,
                held: tracker.bpm,
                confidence: tracker.confidence,
                rival: tracker.rivalBpm,
            });
        }
    }
    return steps;
}

// The first update at which a tempo was held, which is when the tracker locked.
export function findFirstLock(steps: readonly TrackerStep[]): TrackerStep | undefined {
    return steps.find((step) => step.held > 0);
}

export interface Candidate {
    role: string;
    bpm: number;
    lag: number;
    // Combined-series autocorrelation peak at the candidate's own lag, and at its own 4x and 8x (a lag past the trusted
    // correlation is undefined). 3 x 44.4 frames and 4 x 33.3 frames are the same lag, so each rival is judged at
    // its own multiples.
    ac1: number | undefined;
    ac4: number | undefined;
    ac8: number | undefined;
    // Kick-band-only autocorrelation at the lag, and every band's.
    kick: number | undefined;
    bands: (number | undefined)[];
    // Subdivision support: the autocorrelation half and a third of a lag away.
    half: number | undefined;
    third: number | undefined;
}

function peakHeight(window: Correlation | undefined, lag: number): number | undefined {
    return window === undefined ? undefined : interpolatedPeak(window, lag)?.height;
}

// Measures one lag in the combined window and each band's window.
export function measureCandidate(
    role: string,
    lag: number,
    combined: Correlation,
    bands: readonly (Correlation | undefined)[],
    frameRate: number,
): Candidate {
    return {
        role,
        bpm: (60 * frameRate) / lag,
        lag,
        ac1: peakHeight(combined, lag),
        ac4: peakHeight(combined, 4 * lag),
        ac8: peakHeight(combined, 8 * lag),
        kick: peakHeight(bands[0], lag),
        bands: bands.map((band) => peakHeight(band, lag)),
        half: peakHeight(combined, lag / 2),
        third: peakHeight(combined, lag / 3),
    };
}

// A lag snapped to the nearest autocorrelation peak, or the lag itself when it is too near the edge to search.
function snap(window: Correlation, lag: number): number {
    return interpolatedPeak(window, lag)?.lag ?? lag;
}

// The two dotted neighbors of a pulse (4/3 and 3/4 of its lag) that fit the tracker's tempo range, snapped to their
// peaks, with the stronger one first. Dotted notes make exactly these pulses against the beat.
export function dottedRivals(window: Correlation, lag: number, geometry: TempoGeometry): number[] {
    return [(lag * 4) / 3, (lag * 3) / 4]
        .filter((candidate) => candidate >= geometry.minLag && candidate <= geometry.maxLag)
        .map((candidate) => snap(window, candidate))
        .map((candidate) => ({ lag: candidate, height: peakHeight(window, candidate) ?? -Infinity }))
        .sort((a, b) => b.height - a.height)
        .map((entry) => entry.lag);
}

// The octave of `lag` (a power of two times it) that lies nearest `target` on a log scale.
export function foldToOctave(lag: number, target: number): number {
    return lag * 2 ** Math.round(Math.log2(target / lag));
}

// The candidates worth comparing at one tempo update: the tracker's winner and its top dotted rival, the tracker's own
// strongest rival, and, when the track has a reference tempo, the reference (folded into the winner's octave) and its
// top dotted rival. Candidates within 2% of an earlier one are the same pulse and share a row.
export function collectCandidates(
    combined: Correlation,
    bands: readonly (Correlation | undefined)[],
    winnerLag: number,
    trackerRivalLag: number,
    referenceBpm: number | undefined,
    geometry: TempoGeometry,
): Candidate[] {
    const wanted: { role: string; lag: number }[] = [{ role: 'tracker winner', lag: winnerLag }];
    const dotted = dottedRivals(combined, winnerLag, geometry);
    if (dotted.length > 0) {
        wanted.push({ role: 'tracker top dotted rival', lag: dotted[0] });
    }
    if (trackerRivalLag > 0) {
        wanted.push({ role: 'tracker strongest rival', lag: snap(combined, trackerRivalLag) });
    }
    if (referenceBpm !== undefined) {
        const referenceLag = foldToOctave((60 * geometry.frameRate) / referenceBpm, winnerLag);
        wanted.push({ role: 'reference', lag: snap(combined, referenceLag) });
        const referenceDotted = dottedRivals(combined, referenceLag, geometry);
        if (referenceDotted.length > 0) {
            wanted.push({ role: 'reference top dotted rival', lag: referenceDotted[0] });
        }
    }
    const merged: { roles: string[]; lag: number }[] = [];
    for (const entry of wanted) {
        const same = merged.find((existing) => Math.abs(existing.lag / entry.lag - 1) <= 0.02);
        if (same) {
            same.roles.push(entry.role);
        } else {
            merged.push({ roles: [entry.role], lag: entry.lag });
        }
    }
    return merged.map((entry) =>
        measureCandidate(entry.roles.join(' = '), entry.lag, combined, bands, geometry.frameRate),
    );
}

export interface ProbeInput {
    name: string;
    series: OnsetSeries;
    referenceBpm?: number;
}

export interface ProbeOptions {
    // Seconds between rows of the over-time table.
    everySeconds?: number;
    // Analyze at most this much of the track.
    maxSeconds?: number;
}

const DEFAULT_EVERY_SECONDS = 5;
const DEFAULT_MAX_SECONDS = 60;

function fixed(value: number | undefined, digits = 3): string {
    return value === undefined || !Number.isFinite(value) ? 'n/a' : value.toFixed(digits);
}

function table(header: string[], rows: string[][]): string[] {
    return [
        `| ${header.join(' | ')} |`,
        `| ${header.map(() => '---').join(' | ')} |`,
        ...rows.map((row) => `| ${row.join(' | ')} |`),
    ];
}

// The Markdown evidence for one track. Everything is derived from the onset series, so the same input prints the same
// text. It reports numbers and does not judge them.
export function buildProbeReport(input: ProbeInput, options: ProbeOptions = {}): string[] {
    const everySeconds = options.everySeconds ?? DEFAULT_EVERY_SECONDS;
    const maxSeconds = options.maxSeconds ?? DEFAULT_MAX_SECONDS;
    const { frameRate } = input.series;
    const limit = Math.min(input.series.combined.length, Math.floor(maxSeconds * frameRate));
    const combined = input.series.combined.subarray(0, limit);
    const geometry = tempoGeometry(frameRate);
    const steps = replayTracker(combined, frameRate);

    const lines: string[] = [`## ${input.name}`, ''];
    lines.push(
        `Frame rate ${fixed(frameRate, 2)} Hz, ${fixed(limit / frameRate, 1)} s analyzed, reference ` +
            `${input.referenceBpm === undefined ? 'none' : `${fixed(input.referenceBpm, 2)} BPM`}. Tempo tracker alone ` +
            '(no song-boundary resets).',
        '',
    );

    const windowAt = (step: TrackerStep): Correlation | undefined => correlateWindow(combined, step.frames, geometry);
    const mirrored = steps.filter((step) => {
        const window = windowAt(step);
        return window !== undefined && Math.abs(estimateTempo(window, geometry).bpm - step.raw) < 1e-6;
    }).length;
    lines.push(
        `Mirror check: the probe's estimate equals the tracker's raw tempo on ${mirrored} of ${steps.length} updates.`,
        '',
    );

    const lock = findFirstLock(steps);
    if (lock === undefined) {
        lines.push('The tracker never locked in the analyzed span, so there is no first-lock evidence.', '');
        return lines;
    }
    lines.push(
        `First lock at ${fixed(lock.time, 2)} s: raw ${fixed(lock.raw, 2)} BPM, held ${fixed(lock.held, 2)} BPM, ` +
            `confidence ${fixed(lock.confidence, 3)}, rival ${fixed(lock.rival, 2)} BPM.`,
        '',
    );

    // The evidence is read at the first lock and again once the window is full: the first lock sees only ~3 s, too short for
    // the 4L and 8L multiples of a slow pulse, while a full window reaches 8L for tempos down to about 75 BPM.
    const full = steps.find((step) => step.frames >= geometry.capacity);
    const moments: { label: string; step: TrackerStep }[] = [{ label: 'first lock', step: lock }];
    if (full !== undefined && full.frames !== lock.frames) {
        moments.push({ label: 'first full window', step: full });
    }
    for (const { label, step } of moments) {
        const window = windowAt(step);
        if (window === undefined) {
            continue;
        }
        const bandWindows = input.series.bands.map((band) =>
            correlateWindow(band.subarray(0, limit), step.frames, geometry),
        );
        const estimate = estimateTempo(window, geometry);
        const candidates = collectCandidates(
            window,
            bandWindows,
            estimate.refinedLag,
            estimate.rivalLag,
            input.referenceBpm,
            geometry,
        );
        lines.push(`### Rival evidence at ${fixed(step.time, 2)} s (${label}, raw ${fixed(step.raw, 2)} BPM)`, '');
        lines.push(
            "Autocorrelation peak heights (interpolated, 0 to 1). `4L` and `8L` are each candidate's own multiples (n/a past " +
                'half the window). `kick` is band 0 alone; `bands` are b0 / b1 / b2 and their sum. `L/2` and `L/3` are the ' +
                'subdivisions.',
            '',
        );
        lines.push(
            ...table(
                ['candidate', 'BPM', 'lag (frames)', 'L', '4L', '8L', 'kick', 'bands b0 / b1 / b2 = sum', 'L/2', 'L/3'],
                candidates.map((c) => [
                    c.role,
                    fixed(c.bpm, 2),
                    fixed(c.lag, 2),
                    fixed(c.ac1),
                    fixed(c.ac4),
                    fixed(c.ac8),
                    fixed(c.kick),
                    `${c.bands.map((value) => fixed(value)).join(' / ')} = ${fixed(
                        c.bands.every((value) => value !== undefined)
                            ? c.bands.reduce<number>((sum, value) => sum + (value ?? 0), 0)
                            : undefined,
                    )}`,
                    fixed(c.half),
                    fixed(c.third),
                ]),
            ),
            '',
        );
    }

    // Old-pulse support: how much autocorrelation the first-held lag keeps as the music goes on.
    const oldLag = (60 * frameRate) / lock.held;
    lines.push('### Tempo over time', '');
    lines.push(
        `\`old pulse\` is the autocorrelation peak at the first-held lag (${fixed(oldLag, 2)} frames, ` +
            `${fixed(lock.held, 2)} BPM); \`raw lag\` is the same at the current raw estimate.`,
        '',
    );
    const rows: string[][] = [];
    let nextTime = lock.time;
    for (const step of steps) {
        if (step.time < nextTime) {
            continue;
        }
        nextTime = (Math.floor(step.time / everySeconds) + 1) * everySeconds;
        const window = windowAt(step);
        rows.push([
            fixed(step.time, 2),
            fixed(step.raw, 2),
            fixed(step.held, 2),
            fixed(step.rival, 2),
            fixed(step.confidence, 3),
            fixed(window === undefined ? undefined : peakHeight(window, oldLag)),
            fixed(window === undefined || step.raw <= 0 ? undefined : peakHeight(window, (60 * frameRate) / step.raw)),
        ]);
    }
    lines.push(...table(['t (s)', 'raw BPM', 'held BPM', 'rival BPM', 'confidence', 'old pulse', 'raw lag'], rows), '');
    return lines;
}
