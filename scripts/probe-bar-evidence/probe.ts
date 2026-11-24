// The bar and level evidence probe (docs/plans/alignment-tracker-leftovers/probe-plan.md). Measurement only.
//
//   npx esbuild scripts/probe-bar-evidence/probe.ts --bundle --platform=node --format=esm --packages=external \
//     --log-level=warning --outfile=node_modules/.cache/probe-bar-evidence.mjs
//   node node_modules/.cache/probe-bar-evidence.mjs <gate|all> --dir <tracks> --out <folder>
//
// `gate` runs step 2 and the pipeline equality check; `all` runs steps 1, 3, 4 and 5 (and repeats step 2's table).

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { renderTrack } from '../../app/features/rhythm/testSignals';
import { TEMPO_MAX_BPM, TEMPO_MIN_BPM } from '../../app/features/rhythm/rhythmConfig';
import { replayPcm } from '../scorecard/engine/replay';
import { constantTruth, foldedError, SCORECARD_TEMPO_TOLERANCE } from '../scorecard/engine/tempoTruth';
import { tempoFigures } from '../scorecard/engine/measureTrack';
import { loadTracks, type TrackSource } from '../scorecard/inputs';
import { analyze, applyVariation, UNTOUCHED, VARIATIONS, type Analysis, type Variation } from './harness';
import {
    CHANNELS,
    FUNCTIONS,
    TATUMS_PER_BEAT,
    TAU,
    candidatesFor,
    margin,
    scoreOf,
    foldContrast,
    type Channel,
    type ScoreFunction,
} from './scores';

const SR = 44100;
const EIGHT_SECONDS = 8;

// ---- Tatum series ----

interface Series {
    NK: number[];
    T: number[];
    C: number[];
    starts: number[];
}

function nearestFrame(a: Analysis, time: number): number {
    return Math.min(a.frameCount - 1, Math.max(0, Math.round((time - a.t0) * a.frameRate)));
}

// Frames whose center is in [from, to), as a half-open index range.
function frameRange(a: Analysis, from: number, to: number): [number, number] {
    const lo = Math.max(0, Math.ceil((from - a.t0) * a.frameRate - 1e-9));
    const hi = Math.min(a.frameCount, Math.ceil((to - a.t0) * a.frameRate - 1e-9));
    return [lo, Math.max(lo, hi)];
}

function chromaSum(a: Analysis, from: number, to: number, out: Float64Array): void {
    out.fill(0);
    const [lo, hi] = frameRange(a, from, to);
    for (let f = lo; f < hi; f++) for (let i = 0; i < 12; i++) out[i] += a.chroma[f * 12 + i];
}

function chromaChange(a: Analysis, start: number, length: number): number {
    const now = new Float64Array(12);
    const before = new Float64Array(12);
    chromaSum(a, start, start + length, now);
    chromaSum(a, start - length, start, before);
    let dot = 0;
    let n1 = 0;
    let n2 = 0;
    for (let i = 0; i < 12; i++) {
        dot += now[i] * before[i];
        n1 += now[i] * now[i];
        n2 += before[i] * before[i];
    }
    if (Math.sqrt(n1) < 1e-9 || Math.sqrt(n2) < 1e-9) return 0;
    return 1 - dot / Math.sqrt(n1 * n2);
}

// Six equal tatums per declared beat, for the declared beats in `beats` (each beat up to the next).
function buildSeries(a: Analysis, beats: readonly number[]): Series {
    const series: Series = { NK: [], T: [], C: [], starts: [] };
    for (let i = 0; i + 1 < beats.length; i++) {
        const length = (beats[i + 1] - beats[i]) / TATUMS_PER_BEAT;
        for (let j = 0; j < TATUMS_PER_BEAT; j++) {
            const start = beats[i] + j * length;
            const frame = nearestFrame(a, start);
            series.NK.push(a.nk[frame]);
            series.T.push(a.total[frame]);
            series.C.push(chromaChange(a, start, length));
            series.starts.push(start);
        }
    }
    return series;
}

function median(values: readonly number[]): number {
    const sorted = [...values].sort((x, y) => x - y);
    const mid = sorted.length >> 1;
    return sorted.length % 2 ? sorted[mid] : 0.5 * (sorted[mid - 1] + sorted[mid]);
}

// ---- One scored run ----

export interface RunScore {
    name: string;
    kind: string;
    truthBpm: number;
    // The first lock (the shared snapshot's own test), or the first declared beat when there was none.
    lockTime: number | null;
    lockFallback: boolean;
    heldBpm: number | null;
    candidates: number[];
    truthPeriod: number | null;
    scorable: boolean;
    // Per function: margin over the full window, and over the first 8 s after the lock (information only).
    margins: Record<ScoreFunction, number>;
    margins8: Record<ScoreFunction, number>;
    // Scores per candidate period, full window.
    scores: Record<ScoreFunction, Record<number, number>>;
    // fold at P = 6 over the first 8 s, per channel (step 5).
    fold6: Record<Channel, number> | null;
    tatumCount: number;
}

function scoreRun(a: Analysis, name: string, kind: string, truthBpm: number, minBpm = TEMPO_MIN_BPM): RunScore {
    const empty = Object.fromEntries(FUNCTIONS.map((f) => [f, Number.NaN])) as Record<ScoreFunction, number>;
    const base: RunScore = {
        name,
        kind,
        truthBpm,
        lockTime: a.lockTime,
        lockFallback: false,
        heldBpm: null,
        candidates: [],
        truthPeriod: null,
        scorable: false,
        margins: { ...empty },
        margins8: { ...empty },
        scores: Object.fromEntries(FUNCTIONS.map((f) => [f, {}])) as RunScore['scores'],
        fold6: null,
        tatumCount: 0,
    };
    let lock = a.lockTime;
    if (lock === null && a.beats.length > 0) {
        lock = a.beats[0];
        base.lockFallback = true;
    }
    if (lock === null) return base;
    base.lockTime = lock;
    const beats = a.beats.filter((t) => t >= lock);
    if (beats.length < 3) return base;
    const intervals = beats.slice(1).map((t, i) => t - beats[i]);
    const held = 60 / median(intervals);
    base.heldBpm = held;
    const series = buildSeries(a, beats);
    base.tatumCount = series.starts.length;
    const early = series.starts.filter((t) => t < lock + EIGHT_SECONDS).length;
    const slice = (s: Series, n: number): Record<Channel, number[]> => ({
        NK: s.NK.slice(0, n),
        T: s.T.slice(0, n),
        C: s.C.slice(0, n),
    });
    const full = slice(series, series.starts.length);
    const first = slice(series, early);
    if (early >= 12) {
        base.fold6 = Object.fromEntries(CHANNELS.map((c) => [c, foldContrast(first[c], 6)])) as Record<Channel, number>;
    }
    const { periods, truthPeriod } = candidatesFor(held, truthBpm, minBpm, TEMPO_MAX_BPM);
    base.candidates = periods;
    base.truthPeriod = truthPeriod ?? null;
    base.scorable = truthPeriod !== undefined && periods.length > 1;
    for (const fn of FUNCTIONS) {
        const all = new Map<number, number>();
        const earlyScores = new Map<number, number>();
        for (const p of periods) {
            all.set(p, scoreOf(fn, full, p));
            earlyScores.set(p, scoreOf(fn, first, p));
        }
        base.scores[fn] = Object.fromEntries(all);
        base.margins[fn] = margin(all, truthPeriod);
        base.margins8[fn] = margin(earlyScores, truthPeriod);
    }
    return base;
}

// ---- Track set ----

interface Prepared {
    source: { name: string; pcm: Float32Array; sampleRate: number };
    truthBpm: number;
}

function truthOf(source: TrackSource): number {
    return source.sidecar?.tempo ?? source.bpm ?? Number.NaN;
}

function synthetic(name: string, bpm: number, beatsPerBar: 3 | 4): Prepared {
    const track = renderTrack({ seconds: 45, bpm, beatsPerBar });
    return { source: { name, pcm: track.pcm, sampleRate: 44100 }, truthBpm: bpm };
}

const TARGETS = ['6-8-time', 'half-time-shuffle'];
const CONTROLS = [
    'click-174',
    'drums-150',
    'trap-2to1-half-140',
    'low-bpm-rnb',
    'summer2000',
    'lonley',
    'drums-128',
    'imyourgirl',
    'syncopationbass2',
];
const HELD_OUT = [
    'click-90',
    'click-120',
    'click-140',
    'drifting-tempo',
    'drums-100',
    'no-kick-124',
    'syncopationbass',
    'trap-2to1-double-90',
    'trap-4to3-120',
    'bassline-kick-120',
    'pad-lead-groove-110',
];

const fmt = (v: number): string => (Number.isNaN(v) ? 'n/a' : v.toFixed(3));

// ---- Step 2 ----

interface VariationRun {
    id: string;
    heldBpmAtEnd: number;
    wrong: boolean;
    lockSeconds: number | null;
    everLocked: boolean;
    withinShare: number | null;
    firstLockBpm: number | null;
}

function step2(syn: TrackSource): VariationRun[] {
    const truth = truthOf(syn);
    const rows: VariationRun[] = [];
    for (const variation of VARIATIONS) {
        const a = analyze(applyVariation(syn.pcm, syn.sampleRate, variation), syn.sampleRate);
        rows.push(variationRow(a, truth, variation));
    }
    return rows;
}

function variationRow(a: Analysis, truth: number, variation: Variation): VariationRun {
    const figures = tempoFigures(a.tempo, constantTruth(truth));
    const tail = a.tempo.filter((s) => s.time >= a.seconds - 10 && s.bpm > 0).map((s) => s.bpm);
    const end = tail.length > 0 ? median(tail) : 0;
    const first = a.tempo.find((s) => s.bpm > 0);
    return {
        id: variation.id,
        heldBpmAtEnd: end,
        // A wrong tempo is a held tempo at the end that is not the truth at any octave (folded error above the tolerance).
        wrong: end > 0 && foldedError(end, truth) > SCORECARD_TEMPO_TOLERANCE,
        lockSeconds: figures.lockSeconds,
        everLocked: figures.everLocked,
        withinShare: figures.tempoWithinShareAfterLock,
        firstLockBpm: first?.bpm ?? null,
    };
}

function pipelineEquality(drums: TrackSource): Record<string, unknown> {
    const a = analyze(drums.pcm, drums.sampleRate);
    const r = replayPcm(drums.pcm, drums.sampleRate);
    let tempoDiff = a.tempo.length === r.tempo.length ? 0 : Infinity;
    for (let i = 0; i < Math.min(a.tempo.length, r.tempo.length); i++) {
        tempoDiff = Math.max(
            tempoDiff,
            Math.abs(a.tempo[i].bpm - r.tempo[i].bpm),
            Math.abs(a.tempo[i].time - r.tempo[i].time),
        );
    }
    let beatDiff = a.beats.length === r.beats.length ? 0 : Infinity;
    for (let i = 0; i < Math.min(a.beats.length, r.beats.length); i++)
        beatDiff = Math.max(beatDiff, Math.abs(a.beats[i] - r.beats[i]));
    return {
        tempoSamples: [a.tempo.length, r.tempo.length],
        beats: [a.beats.length, r.beats.length],
        maxTempoDiff: tempoDiff,
        maxBeatTimeDiff: beatDiff,
    };
}

// ---- Main ----

function arg(name: string, fallback?: string): string {
    const i = process.argv.indexOf(`--${name}`);
    if (i >= 0 && process.argv[i + 1]) return process.argv[i + 1];
    if (fallback !== undefined) return fallback;
    throw new Error(`missing --${name}`);
}

function main(): void {
    const command = process.argv[2];
    const dir = arg('dir');
    const out = arg('out');
    mkdirSync(out, { recursive: true });
    const { sources } = loadTracks(dir);
    const byName = new Map(sources.map((s) => [s.name.replace(/\.wav$/, ''), s]));
    const need = (name: string): TrackSource => {
        const s = byName.get(name);
        if (!s) throw new Error(`track ${name} not found in ${dir}`);
        return s;
    };
    const log: string[] = [];
    const say = (line = ''): void => {
        log.push(line);
        console.log(line);
    };

    // Step 2 and the pipeline equality.
    const syn = need('syncopation-no-kick');
    const equality = pipelineEquality(need('drums-128'));
    say(`pipeline equality on drums-128 (probe analysis vs replayPcm): ${JSON.stringify(equality)}`);
    const variationRows = step2(syn);
    const plainSyn = variationRow(analyze(syn.pcm, syn.sampleRate), truthOf(syn), { id: 'plain' });
    say('\nStep 2: syncopation-no-kick start variations (truth 135)');
    say('| variation | tempo at the end | wrong | first nonzero | lock s |');
    say('|---|---|---|---|---|');
    for (const row of [plainSyn, ...variationRows]) {
        say(
            `| ${row.id} | ${row.heldBpmAtEnd.toFixed(1)} | ${row.wrong ? 'WRONG' : 'ok'} | ${row.firstLockBpm?.toFixed(1) ?? '-'} | ${row.lockSeconds?.toFixed(2) ?? 'none'} |`,
        );
    }
    const wrongCount = variationRows.filter((r) => r.wrong).length;
    say(
        `wrong tempo count: ${wrongCount} of ${variationRows.length} (${variationRows
            .filter((r) => r.wrong)
            .map((r) => r.id)
            .join(', ')})`,
    );
    writeFileSync(join(out, 'step2.json'), JSON.stringify({ equality, plainSyn, variationRows, wrongCount }, null, 1));
    if (command === 'gate') return;

    // ---- every scored run ----
    const runs: RunScore[] = [];
    const analyses = new Map<string, Analysis>();
    const plain = (s: TrackSource, kind: string): void => {
        const a = analyze(s.pcm, s.sampleRate);
        analyses.set(s.name, a);
        runs.push(scoreRun(a, s.name.replace(/\.wav$/, ''), kind, truthOf(s)));
    };
    for (const name of TARGETS) plain(need(name), 'target');
    plain(syn, 'syn-plain');
    for (const name of CONTROLS) plain(need(name), 'control');
    for (const name of HELD_OUT) {
        const s = need(name);
        plain(s, 'heldout');
        for (const v of UNTOUCHED) {
            const a = analyze(applyVariation(s.pcm, s.sampleRate, v), s.sampleRate);
            runs.push(scoreRun(a, `${name}+${v.id}`, 'heldout', truthOf(s)));
        }
    }
    // held-out untouched offsets of the syncopation track are extra samples of the same target, reported for information
    for (const v of UNTOUCHED) {
        const a = analyze(applyVariation(syn.pcm, syn.sampleRate, v), syn.sampleRate);
        runs.push(scoreRun(a, `syncopation-no-kick+${v.id}`, 'syn-extra', truthOf(syn)));
    }
    const synVariationRuns: RunScore[] = [];
    for (const v of VARIATIONS) {
        const a = analyze(applyVariation(syn.pcm, syn.sampleRate, v), syn.sampleRate);
        synVariationRuns.push(scoreRun(a, `syncopation-no-kick+${v.id}`, 'syn-variation', truthOf(syn)));
    }
    const synthetics: Array<[string, number, 3 | 4, string]> = [
        ['synthetic-3/4-180', 180, 3, 'target-click'],
        ['synthetic-4/4-180', 180, 4, 'control'],
        ['synthetic-3/4-120', 120, 3, 'control'],
        ['synthetic-3/4-140', 140, 3, 'control'],
    ];
    for (const [name, bpm, beats, kind] of synthetics) {
        const p = synthetic(name, bpm, beats);
        const a = analyze(p.source.pcm, p.source.sampleRate);
        analyses.set(name, a);
        runs.push(scoreRun(a, name, kind, bpm));
    }
    // Beatless is a step 5 subject only.
    plain(need('beatless'), 'beatless');
    plain(need('high-bpm-dnb'), 'dnb');
    writeFileSync(join(out, 'runs.json'), JSON.stringify({ runs, synVariationRuns }, null, 1));

    // ---- Step 3 tables ----
    const target = (name: string): RunScore =>
        runs.find((r) => r.name === name && r.kind.startsWith('target')) as RunScore;
    const synMargin = (fn: ScoreFunction): number => {
        const values = synVariationRuns.map((r) => (r.scorable ? r.margins[fn] : Number.NaN));
        return values.some(Number.isNaN) ? Number.NaN : Math.min(...values);
    };
    const targetMargin = (name: string, fn: ScoreFunction): number =>
        name === 'syncopation-no-kick'
            ? synMargin(fn)
            : name.startsWith('synthetic')
              ? target('synthetic-3/4-180').margins[fn]
              : target(name).margins[fn];
    const targetNames = ['synthetic-3/4-180', '6-8-time', 'half-time-shuffle', 'syncopation-no-kick'];
    say('\nStep 3: target margins (full window; n/a = not scorable)');
    say(`| function | ${targetNames.join(' | ')} | real targets >= ${TAU} | median of four |`);
    say(`|---|${targetNames.map(() => '---').join('|')}|---|---|`);
    const summary = FUNCTIONS.map((fn) => {
        const values = targetNames.map((n) => targetMargin(n, fn));
        const count = values.slice(1).filter((v) => v >= TAU).length;
        const available = values.filter((v) => !Number.isNaN(v));
        const med = available.length > 0 ? median(available) : -Infinity;
        say(`| ${fn} | ${values.map(fmt).join(' | ')} | ${count} | ${fmt(med)} |`);
        return { fn, values, count, med };
    });
    const chosen = [...summary].sort((x, y) => y.count - x.count || y.med - x.med)[0];
    say(
        `chosen function: ${chosen.fn} (${chosen.count} of 3 real targets at or above ${TAU}, median ${fmt(chosen.med)})`,
    );
    const fn = chosen.fn;

    // Information only: 6-8-time's truth (62) is P = 18 at the level the tracker holds, 59.9 bpm, just under the range edge,
    // so it is left out. The same scores with the lower edge relaxed to 50 bpm, and the syncopation variations that were
    // scorable.
    const relaxed = scoreRun(
        analyses.get('6-8-time.wav') as Analysis,
        '6-8-time',
        'info',
        truthOf(need('6-8-time')),
        50,
    );
    say(
        `\nInformation only, 6-8-time with the lower tempo edge relaxed to 50 bpm: H ${relaxed.heldBpm?.toFixed(1)}, candidates ${relaxed.candidates.join(',')}, truth period ${relaxed.truthPeriod}, margins ${FUNCTIONS.map((f) => `${f} ${fmt(relaxed.margins[f])}`).join(', ')}`,
    );
    for (const f of FUNCTIONS) {
        const ok = synVariationRuns.filter((r) => r.scorable);
        say(
            `Information only, syncopation-no-kick ${f}: ${ok.length} of 10 variations scorable, smallest margin among them ${fmt(Math.min(...ok.map((r) => r.margins[f])))}, at or above tau ${ok.filter((r) => r.margins[f] >= TAU).length}`,
        );
    }
    say('\nTargets, 8 s window (information only) for the chosen function and syncopation variations:');
    for (const n of ['synthetic-3/4-180', '6-8-time', 'half-time-shuffle'])
        say(`${n}: ${fmt((n.startsWith('synthetic') ? target('synthetic-3/4-180') : target(n)).margins8[fn])}`);
    say(`syncopation-no-kick variations (min): ${fmt(Math.min(...synVariationRuns.map((r) => r.margins8[fn])))}`);

    say(`\nSyncopation-no-kick variations, ${fn} margin (and held bpm, truth period):`);
    for (const r of synVariationRuns)
        say(
            `| ${r.name} | H ${r.heldBpm?.toFixed(1)} | P* ${r.truthPeriod} | ${fmt(r.margins[fn])} | candidates ${r.candidates.join(',')} |`,
        );

    const controlRuns = runs.filter((r) => r.kind === 'control');
    say(`\nControls, ${fn} margin:`);
    say('| control | H | truth P | margin | all six |');
    say('|---|---|---|---|---|');
    for (const r of controlRuns)
        say(
            `| ${r.name} | ${r.heldBpm?.toFixed(1)} | ${r.truthPeriod} | ${fmt(r.margins[fn])} | ${FUNCTIONS.map((f) => fmt(r.margins[f])).join(' ')} |`,
        );
    const heldRuns = runs.filter((r) => r.kind === 'heldout');
    say(`\nHeld out, ${fn} margin:`);
    say('| sample | H | truth P | margin | all six |');
    say('|---|---|---|---|---|');
    for (const r of heldRuns)
        say(
            `| ${r.name} | ${r.heldBpm?.toFixed(1)} | ${r.truthPeriod} | ${fmt(r.margins[fn])} | ${FUNCTIONS.map((f) => fmt(r.margins[f])).join(' ')} |`,
        );

    const targetRealPass = chosen.values.slice(1).filter((v) => v >= TAU).length;
    const controlsPass = controlRuns.every((r) => r.margins[fn] > 0);
    const heldPositive = heldRuns.every((r) => r.margins[fn] > 0);
    const heldShare = heldRuns.filter((r) => r.margins[fn] >= TAU).length / heldRuns.length;
    const go = targetRealPass >= 2 && controlsPass && heldPositive && heldShare >= 0.8;
    say(
        `\nRule 2 (at least two real targets at or above ${TAU}): ${targetRealPass >= 2 ? 'pass' : 'fail'} (${targetRealPass})`,
    );
    say(
        `Rule 3 controls all above 0: ${controlsPass ? 'pass' : 'fail'}; held-out all above 0: ${heldPositive ? 'pass' : 'fail'}; held-out at or above ${TAU}: ${(heldShare * 100).toFixed(0)}% (${heldRuns.filter((r) => r.margins[fn] >= TAU).length} of ${heldRuns.length})`,
    );
    say(`LEVEL AND METER FAMILY: ${go ? 'GO' : 'NO-GO'}`);
    for (const f of FUNCTIONS) {
        const controlsOk = controlRuns.every((r) => r.margins[f] > 0);
        const heldAll = heldRuns.filter((r) => r.margins[f] > 0).length;
        const heldTau = heldRuns.filter((r) => r.margins[f] >= TAU).length;
        say(
            `  (info) ${f}: controls above 0 ${controlsOk}; held-out above 0 ${heldAll}/${heldRuns.length}; at or above tau ${heldTau}/${heldRuns.length}`,
        );
    }

    // ---- Step 5 ----
    say('\nStep 5: fold at P = 6 over the first 8 s after the lock (plain runs)');
    const beatless = runs.find((r) => r.kind === 'beatless') as RunScore;
    const others = runs.filter(
        (r) =>
            r.kind !== 'beatless' &&
            r.kind !== 'dnb' &&
            r.kind !== 'syn-extra' &&
            !r.name.includes('+') &&
            r.fold6 !== null,
    );
    say(
        `beatless: lock ${beatless.lockTime?.toFixed(2) ?? 'none'}${beatless.lockFallback ? ' (first declared beat, no lock)' : ''}, held ${beatless.heldBpm?.toFixed(1) ?? 'n/a'}, tatums ${beatless.tatumCount}, fold6 ${beatless.fold6 ? CHANNELS.map((c) => `${c} ${fmt((beatless.fold6 as Record<Channel, number>)[c])}`).join(', ') : 'n/a'}`,
    );
    say('| function | beatless | smallest elsewhere | on | margin |');
    say('|---|---|---|---|---|');
    const step5: Record<string, number> = {};
    for (const c of CHANNELS) {
        const mine = beatless.fold6 ? beatless.fold6[c] : Number.NaN;
        let low = Infinity;
        let lowName = '';
        for (const r of others) {
            const v = (r.fold6 as Record<Channel, number>)[c];
            if (v < low) {
                low = v;
                lowName = r.name;
            }
        }
        step5[`fold.${c}`] = low - mine;
        say(`| fold.${c} | ${fmt(mine)} | ${fmt(low)} | ${lowName} | ${fmt(low - mine)} |`);
    }
    say(
        `BEATLESS: ${Object.values(step5).some((m) => m >= TAU) ? 'GO (evidence for a later plan)' : 'NO-GO'}; tracks compared: ${others.length}`,
    );

    // ---- Step 1 ----
    say(
        '\nStep 1: what the meter receives (accent spread by beat position, mean accent per position over overall mean)',
    );
    const step1Tracks = [
        '6-8-time',
        'half-time-shuffle',
        'syncopation-no-kick',
        'drums-128',
        'low-bpm-rnb',
        'synthetic-3/4-180',
    ];
    let maxAccentDiff = 0;
    for (const name of step1Tracks) {
        const a = analyses.get(name) ?? analyses.get(`${name}.wav`);
        if (!a) continue;
        const recs = a.beatRecords;
        for (const r of recs) maxAccentDiff = Math.max(maxAccentDiff, Math.abs(r.accent - r.accentRecomputed));
        const overall = recs.reduce((s, r) => s + r.accent, 0) / Math.max(1, recs.length);
        const lines = [2, 3, 4].map((m) => {
            const sum = new Array<number>(m).fill(0);
            const cnt = new Array<number>(m).fill(0);
            for (const r of recs) {
                sum[((r.index % m) + m) % m] += r.accent;
                cnt[((r.index % m) + m) % m]++;
            }
            const means = sum.map((v, k) => (cnt[k] ? v / cnt[k] / overall : 0));
            return `mod ${m}: ${means.map((v) => v.toFixed(2)).join(' ')} (spread ${(Math.max(...means) - Math.min(...means)).toFixed(2)})`;
        });
        say(`${name}: ${recs.length} beats, mean accent ${overall.toFixed(3)}; ${lines.join('; ')}`);
        const csv = ['index,time,period,featureKick,featureTotal,featureChroma,accent'].concat(
            recs.map((r) =>
                [r.index, r.time.toFixed(4), r.period.toFixed(5), r.kick, r.total, r.chroma, r.accent].join(','),
            ),
        );
        writeFileSync(join(out, `step1-${name.replace(/[^a-z0-9-]/gi, '_')}.csv`), csv.join('\n'));
    }
    say(
        `largest |stored accent - accent recomputed in double from the same inputs and the meter's own means|: ${maxAccentDiff.toExponential(2)} (the stored accent is float32)`,
    );

    // ---- Step 4 ----
    say('\nStep 4: 3:2 neighbor ratio R = score at 2/3 of the estimate lag / score at the estimate lag');
    const drumsUpdates = need('drums-128') && analyses.get('drums-128.wav');
    if (drumsUpdates) {
        const ups = drumsUpdates.updates.filter((u) => u.rawBpm > 0);
        const ok = ups.filter(
            (u) => u.estimatePeakLag > 0 && u.scoreAtEstimate > 0 && Math.abs(u.estimatePeakOffset) <= 1.5,
        ).length;
        say(
            `readability check on drums-128: ${ok} of ${ups.length} estimates have a comb peak at their own lag with a positive score within 1.5 lags (scores read from the tracker's own array, not recomputed)`,
        );
    }
    const step4 = step4Table(sources, runs, analyses);
    for (const l of step4.lines) say(l);
    writeFileSync(join(out, 'step4.json'), JSON.stringify(step4.data, null, 1));
    writeFileSync(join(out, 'tables.md'), log.join('\n'));
}

function step4Table(sources: TrackSource[], runs: RunScore[], analyses: Map<string, Analysis>) {
    const lines: string[] = [];
    let targetMin = Infinity;
    let targetCount = 0;
    let rivalMax = -Infinity;
    let rivalWhere = '';
    let rivalCount = 0;
    const perTrack: Record<string, { updates: number; maxR: number }> = {};
    for (const s of sources) {
        const name = s.name.replace(/\.wav$/, '');
        const a = analyses.get(s.name);
        if (!a || runs.find((r) => r.name === name && r.kind === 'beatless')) continue;
        const truthBpm = truthOf(s);
        const figures = tempoFigures(a.tempo, constantTruth(truthBpm));
        if (figures.lockSeconds === null) {
            lines.push(`${name}: no first lock in the scorecard sense, left out`);
            continue;
        }
        let maxR = 0;
        let n = 0;
        for (const u of a.updates) {
            if (u.time < 3 || u.time >= figures.lockSeconds || u.rawBpm <= 0 || !(u.scoreAtEstimate > 0)) continue;
            const r = u.scoreAtFaster / u.scoreAtEstimate;
            if (name === 'high-bpm-dnb') {
                if (Math.abs(u.rawBpm / ((2 / 3) * truthBpm) - 1) <= 0.04) {
                    targetMin = Math.min(targetMin, r);
                    targetCount++;
                }
            } else if (Math.abs((u.rawBpm * 1.5) / truthBpm - 1) > 0.04) {
                n++;
                maxR = Math.max(maxR, r);
                if (r > rivalMax) {
                    rivalMax = r;
                    rivalWhere = `${name} at ${u.time.toFixed(2)} s (estimate ${u.rawBpm.toFixed(1)})`;
                }
                rivalCount++;
            }
        }
        perTrack[name] = { updates: n, maxR };
    }
    for (const [name, v] of Object.entries(perTrack))
        lines.push(`${name}: ${v.updates} updates before the lock, largest R ${v.maxR.toFixed(3)}`);
    const measurable = targetCount > 0;
    lines.push(
        `target: high-bpm-dnb updates holding 115 (within 4%) before its lock: ${targetCount}, smallest R ${measurable ? targetMin.toFixed(3) : 'n/a'}`,
    );
    lines.push(`rival: ${rivalCount} updates on every other track, largest R ${rivalMax.toFixed(3)} (${rivalWhere})`);
    const marginValue = targetMin - rivalMax;
    lines.push(
        `margin ${measurable ? marginValue.toFixed(3) : 'n/a'}; CANDIDATE SET: ${measurable && marginValue >= 0.05 ? 'GO' : 'NO-GO'}`,
    );
    return { lines, data: { targetMin, targetCount, rivalMax, rivalWhere, rivalCount, perTrack } };
}

main();
