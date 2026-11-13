// Writes the synthetic ground-truth tracks to a folder: `<name>.wav`, `<name>.beats.json` (the sidecar of contract C1) and
// `<name>.bpm` (one number, the older sidecar format) for every track in render.ts. Run it with
// `npm run ground-truth -- <out-dir>`; with no arguments it prints the usage. The output is deterministic, so running it
// twice gives the same files. Not part of the app bundle: nothing under app/ imports this file.

import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { writeWav } from '../rhythm-tools/wav';
import { GROUND_TRUTH_SAMPLE_RATE, GROUND_TRUTH_TRACKS, renderGroundTruthTrack } from './render';

const USAGE = `Usage: npm run ground-truth -- <out-dir>

Writes the synthetic ground-truth tracks into <out-dir> (created if needed), each as
  <name>.wav         mono 16-bit PCM
  <name>.beats.json  exact beat and per-band onset times (the sidecar of the alignment evaluation)
  <name>.bpm         the labelled tempo, one number

Then: npm run eval:rhythm -- <out-dir> --alignment

The committed copies of the sidecars are in scripts/ground-truth/sidecars/; the audio is never committed.`;

const argv = process.argv.slice(2);
if (argv.length !== 1 || argv[0].startsWith('-')) {
    console.log(USAGE);
    process.exit(argv.length === 0 || argv[0] === '--help' || argv[0] === '-h' ? 0 : 1);
}

const outDir = resolve(argv[0]);
mkdirSync(outDir, { recursive: true });
for (const spec of GROUND_TRUTH_TRACKS) {
    const { pcm, sidecar } = renderGroundTruthTrack(spec);
    writeFileSync(join(outDir, `${spec.name}.wav`), writeWav(pcm, GROUND_TRUTH_SAMPLE_RATE));
    writeFileSync(join(outDir, `${spec.name}.beats.json`), `${JSON.stringify(sidecar, null, 2)}\n`);
    writeFileSync(join(outDir, `${spec.name}.bpm`), `${spec.bpm}\n`);
}
console.log(`Wrote ${GROUND_TRUTH_TRACKS.length} tracks to ${outDir}`);
