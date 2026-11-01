// Generates app/features/visualizers/dancing-character/assets/MakeHumanDancer.glb from the CC0 MakeHuman source files.
// Run it from the repository root, see the USAGE text. The output is deterministic: the same input files give the same
// bytes. Not part of the app bundle: nothing under app/ imports this file.

import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { checkGlb } from './check';
import { buildGlb } from './glb';
import { GARMENTS, loadOutfit, OUTFIT_PACK_SHA256, OUTFIT_PACK_URL } from './outfit';
import { INPUTS, parseObj, parseSkeleton, parseWeights, readInput, SOURCE_COMMIT } from './makehuman';

const DEFAULT_OUTPUT = 'app/features/visualizers/dancing-character/assets/MakeHumanDancer.glb';

const USAGE = `Usage: npx esbuild scripts/dancing-character-model/build-model.ts --bundle --platform=node --format=esm \\
  --packages=external --log-level=warning --outfile=node_modules/.cache/build-model.mjs \\
  && node node_modules/.cache/build-model.mjs <input-dir> --outfit <outfit-dir> [--out <file.glb>] [--no-check]

Builds a skinned, rigged, dressed CC0 humanoid GLB (no animation) from the MakeHuman files in <input-dir> and the
clothes in <outfit-dir>. Run it from the repository root. The files come from https://github.com/makehumancommunity/makehuman at commit ${SOURCE_COMMIT},
under makehuman/data/, and are checked against their expected sha256:
  ${INPUTS.obj.file}              (3dobjs/)
  ${INPUTS.skeleton.file}        (rigs/)
  ${INPUTS.weights.file}  (rigs/)
  ${INPUTS.material.file}        (skins/)

<outfit-dir> holds the flattened CC0 system assets from ${OUTFIT_PACK_URL}
(sha256 ${OUTFIT_PACK_SHA256}), each file checked against its expected sha256:
${GARMENTS.map((g) => `  ${[g.clothes, g.obj, g.material, g.texture, ...g.extra].map((f) => f.file).join(', ')}`).join('\n')}

Options:
  --outfit <dir>  The folder with the clothes files (required to build).
  --out <file>    Where to write the GLB (default ${DEFAULT_OUTPUT}).
  --no-check      Skip loading the result with GLTFLoader and printing the rig report.
  --check <glb>   Only run the check on an existing GLB (no input directory needed).
  --help          Show this text.`;

async function main(): Promise<void> {
    const args = process.argv.slice(2);
    if (args.length === 0 || args.includes('--help')) {
        console.log(USAGE);
        return;
    }
    const flagValue = (flag: string): string | undefined => {
        const at = args.indexOf(flag);
        return at >= 0 ? args[at + 1] : undefined;
    };
    const only = flagValue('--check');
    if (only) {
        await checkGlb(resolve(only));
        return;
    }

    const outFlag = flagValue('--out');
    const positional = args.filter(
        (arg, i) => !arg.startsWith('--') && args[i - 1] !== '--out' && args[i - 1] !== '--outfit',
    );
    const inputDir = positional[0];
    const outfitDir = flagValue('--outfit');
    if (!inputDir) throw new Error('missing <input-dir>');
    if (!outfitDir) throw new Error('missing --outfit <dir>');
    const output = resolve(outFlag ?? DEFAULT_OUTPUT);

    // joint-* groups are helper geometry that only the skeleton references, so the whole vertex array is parsed and the
    // body faces are picked out of it.
    const mesh = parseObj(readInput(inputDir, INPUTS.obj));
    const bones = parseSkeleton(readInput(inputDir, INPUTS.skeleton), mesh.vertices);
    const weights = parseWeights(readInput(inputDir, INPUTS.weights), mesh.vertices.length / 3);
    readInput(inputDir, INPUTS.material);

    const garments = await loadOutfit(outfitDir, mesh.vertices, weights);

    const { glb, stats } = buildGlb(mesh, bones, weights, garments);
    mkdirSync(dirname(output), { recursive: true });
    writeFileSync(output, glb);
    const sha256 = createHash('sha256').update(glb).digest('hex');
    console.log(`wrote ${output}`);
    console.log(`bytes ${glb.length}, sha256 ${sha256}`);
    console.log(
        `vertices ${stats.vertices}, triangles ${stats.triangles}, bones ${stats.bones}, ` +
            `vertices without source weights ${stats.unweightedVertices}, body faces hidden ${stats.deletedBodyFaces}`,
    );
    for (const part of stats.parts)
        console.log(`  ${part.name}: ${part.vertices} vertices, ${part.triangles} triangles`);

    if (!args.includes('--no-check')) await checkGlb(output);
}

main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
});
