import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { renderTrack, TEST_SAMPLE_RATE } from '../../app/features/rhythm/testSignals';
import { writeWav } from '../rhythm-tools/wav';
import { buildScorecard } from './cells';
import { DEFAULT_DIR, DEFAULT_OUT, loadTracks, measureSources, parseRunArgs, sha256, summaryLine } from './inputs';

describe('parseRunArgs', () => {
    it('has defaults', () => {
        expect(parseRunArgs([])).toEqual({ dir: DEFAULT_DIR, out: DEFAULT_OUT, writeBaseline: false, help: false });
    });

    it('reads every flag', () => {
        expect(parseRunArgs(['--dir', 'd', '--out', 'o', '--write-baseline', '--help'])).toEqual({
            dir: 'd',
            out: 'o',
            writeBaseline: true,
            help: true,
        });
    });

    it('rejects a missing value and an unknown argument', () => {
        expect(() => parseRunArgs(['--dir'])).toThrow(/needs a value/);
        expect(() => parseRunArgs(['--dir', '--out'])).toThrow(/needs a value/);
        expect(() => parseRunArgs(['nope'])).toThrow(/Unexpected/);
    });
});

describe('loadTracks', () => {
    const dirs: string[] = [];
    const makeDir = (): string => {
        const dir = mkdtempSync(join(tmpdir(), 'scorecard-'));
        dirs.push(dir);
        return dir;
    };
    afterEach(() => {
        for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
    });

    const click = renderTrack({ seconds: 6, bpm: 120, beatsPerBar: 4 });
    const wav = writeWav(click.pcm, TEST_SAMPLE_RATE);

    it('reads tracks with a .bpm, skips tracks with no tempo truth and warns about unlisted ones', () => {
        const dir = makeDir();
        writeFileSync(join(dir, 'lonley.wav'), wav);
        writeFileSync(join(dir, 'lonley.bpm'), '120\n');
        writeFileSync(join(dir, 'imyourgirl.wav'), wav);
        writeFileSync(join(dir, 'mystery.wav'), wav);
        writeFileSync(join(dir, 'mystery.bpm'), 'abc');
        writeFileSync(join(dir, 'beatless.wav'), wav);
        const { sources, warnings } = loadTracks(dir);
        const names = sources.map((s) => s.name);
        expect(names).toContain('lonley.wav');
        expect(names).toContain('beatless.wav');
        expect(names).not.toContain('imyourgirl.wav');
        expect(sources.find((s) => s.name === 'lonley.wav')?.bpm).toBe(120);
        expect(sources.find((s) => s.name === 'beatless.wav')?.class).toBe('beatless');
        expect(warnings.join('\n')).toMatch(/imyourgirl.wav has no tempo truth/);
        expect(warnings.join('\n')).toMatch(/mystery.wav is not in the expected/);
        expect(warnings.join('\n')).toMatch(/mystery.bpm does not hold/);
    });

    it('renders the generated tracks that are not in the folder and hashes the sidecars it reads', () => {
        const dir = makeDir();
        const sidecarText = JSON.stringify({
            track: 'lonley.wav',
            tempo: 120,
            beats: click.beatTimes,
            source: 'tapped',
            tapOffsetMs: 0,
        });
        writeFileSync(join(dir, 'lonley.wav'), wav);
        writeFileSync(join(dir, 'lonley.beats.json'), sidecarText);
        const { sources } = loadTracks(dir);
        const generated = sources.filter(
            (s) => s.name === 'bassline-kick-120.wav' || s.name === 'pad-lead-groove-110.wav',
        );
        expect(generated).toHaveLength(2);
        expect(generated.every((s) => s.class === 'synthetic' && s.sidecar !== undefined)).toBe(true);
        expect(sources.find((s) => s.name === 'lonley.wav')?.sidecarHash).toBe(sha256(sidecarText));
    });

    it('warns about a missing folder and rejects a broken sidecar', () => {
        expect(loadTracks(join(makeDir(), 'missing')).warnings[0]).toMatch(/no WAV files/);
        const dir = makeDir();
        writeFileSync(join(dir, 'lonley.wav'), wav);
        writeFileSync(join(dir, 'lonley.beats.json'), '{}');
        expect(() => loadTracks(dir)).toThrow(/lonley.beats.json/);
    });
});

describe('measureSources', () => {
    it('measures a source into cells and a summary', () => {
        const click = renderTrack({ seconds: 10, bpm: 120, beatsPerBar: 4 });
        const seen: string[] = [];
        const result = measureSources(
            [
                {
                    name: 'lonley.wav',
                    class: 'tapped',
                    pcm: click.pcm,
                    sampleRate: TEST_SAMPLE_RATE,
                    bpm: 120,
                    sidecarHash: 'h',
                },
            ],
            (name) => seen.push(name),
        );
        expect(seen).toEqual(['lonley.wav']);
        expect(result.sidecarHashes).toEqual({ 'lonley.wav': 'h' });
        expect(result.available).toEqual([{ track: 'lonley.wav', hasBeats: false }]);
        const scorecard = buildScorecard({ revision: 'r', created: 'c', scenarios: [], ...result });
        expect(summaryLine(scorecard)).toMatch(/^Applicable cells \d+: \d+ passing, \d+ failing, \d+ unavailable\./);
    });
});
