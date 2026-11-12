// Builds the four dance clips from the CMU motion-capture files and writes
// app/features/visualizers/dancing-character/assets/MakeHumanDances.glb (clips lambada, twist, cabbage-patch, salsa).
// Run (from the repository root):
//   npx esbuild scripts/dancing-character-dances/build.ts --bundle --platform=node --format=esm --packages=external
//     --log-level=warning --outfile=node_modules/.cache/build-dances.mjs && node node_modules/.cache/build-dances.mjs [<input-dir>] [--out <file>] [--approved <SpikeDances.glb>]
// Without <input-dir> the CMU inputs (about 25 MB) are downloaded into memory on every run and never written to disk; with
// it they are read from that local directory instead. Either way every input is verified against its pinned sha256
// before it is parsed. The output is deterministic (two runs are byte-identical). The built file is loaded back with
// GLTFLoader and checked against the hard rules of docs/plans/natural-dance/contracts.md (C2, Amendments 3 and 4); the 40 ms
// contact rule is printed as warnings. With --approved the clips are also compared with the clips approved in the S0g
// spike (lambada=55_02_loop, twist=15_04_twist_soft_loop, cabbage-patch=15_04_cabbage_loop, salsa=60_02_grounded_loop).
// Exits non-zero on any hard failure or when a clip differs from its approved one.

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { Matrix4 } from 'three';
import { scaleAmplitude } from './amplitude';
import { parseAmc, parseAsf } from './acclaim';
import { buildTorso, clearArms } from './clearance';
import type { Torso } from './clearance';
import { buildClip } from './clip';
import type { Clip } from './clip';
import { capUpperArms, faceHeadForward, groundLock, mirrorArm } from './edits';
import { writeAnimationGlb } from './glb';
import { directorySource, fetchVerified, loadInputs } from './inputs';
import { KEYS_PER_BEAT, beatKeys, combineLoops, makeLoop } from './loop';
import { MANIFESTS } from './manifests';
import type { DanceManifest, TakeSpec } from './manifests';
import { retarget } from './retarget';
import { loadGlb, loadTargetRig } from './rig';
import type { TargetRig } from './rig';
import { REPRODUCTION_MAX_DEGREES, REPRODUCTION_MAX_METERS, compareClips, validateClip } from './validate';

const MODEL = resolve('app/features/visualizers/dancing-character/assets/MakeHumanDancer.glb');
const OUTPUT = resolve('app/features/visualizers/dancing-character/assets/MakeHumanDances.glb');

// The approved spike clip each dance has to reproduce.
const APPROVED_CLIP: Record<string, string> = {
    lambada: '55_02_loop',
    twist: '15_04_twist_soft_loop',
    'cabbage-patch': '15_04_cabbage_loop',
    salsa: '60_02_grounded_loop',
};

// Retargets one take and cuts its loop out by the take's beat table.
function loopOf(
    inputs: ReadonlyMap<string, Buffer>,
    take: TakeSpec,
    rig: TargetRig,
    id: string,
): { clip: Clip; seamBefore: number } {
    const input = (name: string): string => {
        const bytes = inputs.get(name);
        if (!bytes) throw new Error(`${id}: input ${name} was not loaded`);
        return bytes.toString('utf8');
    };
    const skeleton = parseAsf(input(take.skeleton));
    const motion = parseAmc(input(take.motion));
    const [from, to] = take.window ?? [0, motion.frames.length - 1];
    const retargeted = retarget(skeleton, { frames: motion.frames.slice(from, to + 1) }, take.fps, rig);
    const source = buildClip(id, retargeted, rig);
    const { clip, report } = makeLoop(source, retargeted, rig, id, beatKeys(take.beatFrames, take.fps, from));
    return { clip, seamBefore: report.seamBefore };
}

function danceClip(inputs: ReadonlyMap<string, Buffer>, manifest: DanceManifest, rig: TargetRig, torso: Torso): Clip {
    const { id } = manifest;
    for (const take of [manifest.take, manifest.upper]) {
        if (take && take.beatFrames.length !== manifest.beats + 1)
            throw new Error(`${id}: the beat table needs beats + 1 frames`);
    }
    const main = loopOf(inputs, manifest.take, rig, id);
    let clip = main.clip;
    let seamBefore = `${main.seamBefore.toFixed(2)}`;
    if (manifest.upper) {
        const upper = loopOf(inputs, manifest.upper, rig, id);
        clip = combineLoops(clip, upper.clip, id);
        seamBefore += ` / ${upper.seamBefore.toFixed(2)} (upper body)`;
    }
    if (manifest.groundLock) groundLock(rig, clip, manifest.groundLock.tolerance);
    if (manifest.amplitude.length > 0) clip = scaleAmplitude(clip, rig, id, [...manifest.amplitude]);
    if (manifest.mirror) {
        const { driver, shiftBeats, liftCapDegrees, elbowCapMeters } = manifest.mirror;
        const capped = capUpperArms(rig, clip, liftCapDegrees, elbowCapMeters, id);
        clip = mirrorArm(rig, capped, driver === 'L' ? 'R' : 'L', shiftBeats * KEYS_PER_BEAT, id);
    }
    const arms = clearArms(rig, torso, clip);
    if (manifest.head) {
        const { keep, scale, neckShare } = manifest.head;
        faceHeadForward(rig, clip, keep, scale, neckShare);
    }
    console.log(
        `${id}: loop closing turned the pose by up to ${seamBefore} deg; arm clearance moved the arms by up to ${arms.maxCorrection.toFixed(1)} deg`,
    );
    return clip;
}

async function main(): Promise<void> {
    const args = process.argv.slice(2);
    const option = (name: string): string | undefined => {
        const at = args.indexOf(name);
        return at < 0 ? undefined : args[at + 1];
    };
    const flagged = new Set(['--out', '--approved'].flatMap((name) => [name, option(name)]));
    const dir = args.find((a) => !flagged.has(a));
    const out = resolve(option('--out') ?? OUTPUT);
    const approvedPath = option('--approved');

    const rig = await loadTargetRig(MODEL);
    const root = rig.byName.get('root');
    if (!root?.parent || !root.parent.matrixWorld.equals(new Matrix4())) {
        throw new Error('the root bone is expected to sit directly under an identity parent');
    }
    const torso = buildTorso(rig);
    const inputNames = MANIFESTS.flatMap((m) => [m.take, m.upper]).flatMap((take) =>
        take ? [take.skeleton, take.motion] : [],
    );
    const inputs = await loadInputs(inputNames, dir ? directorySource(resolve(dir)) : (name) => fetchVerified(name));
    console.log(
        `inputs verified (${dir ? `read from ${resolve(dir)}` : 'downloaded into memory'}): ${[...inputs.keys()].join(', ')}`,
    );
    const clips = MANIFESTS.map((manifest) => danceClip(inputs, manifest, rig, torso));
    const nodeNames = [...new Set(clips.flatMap((clip) => [...clip.quaternions.keys()]))];
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, writeAnimationGlb(clips, nodeNames));
    console.log(`wrote ${out} (${clips.length} clips: ${clips.map((c) => c.id).join(', ')})`);

    // Everything below judges the file as GLTFLoader loads it, the way the app will.
    const gltf = await loadGlb(out);
    const failures: string[] = [];
    const warnings: string[] = [];
    for (const manifest of MANIFESTS) {
        const clip = gltf.animations.find((c) => c.name === manifest.id);
        if (!clip) {
            failures.push(`missing clip ${manifest.id}`);
            continue;
        }
        const report = validateClip(rig, torso, clip, manifest);
        failures.push(...report.failures);
        warnings.push(...report.warnings);
        const m = report.metrics;
        if (m) {
            console.log(
                `${manifest.id}: ${m.keys} keys, ${m.duration} s, seam ${m.seamDegrees.toFixed(3)} deg, foot skate ${(m.skateMeters * 100).toFixed(1)} cm, ` +
                    `floor float ${(m.floorMeters * 100).toFixed(2)} cm, arm clearance ${(m.clearanceMeters * 100).toFixed(2)} cm, ` +
                    `behind chest L ${(m.behindChestMeters.L * 100).toFixed(1)} / R ${(m.behindChestMeters.R * 100).toFixed(1)} cm, ` +
                    `root X/Z travel ${(m.rootXZMeters * 1000).toFixed(1)} mm, contact ${m.contactMs.map((ms) => ms.toFixed(0)).join('/')} ms`,
            );
        }
    }
    const names = gltf.animations.map((c) => c.name).sort();
    if (
        names.join() !==
        MANIFESTS.map((m) => m.id)
            .sort()
            .join()
    )
        failures.push(`unexpected clips ${names.join(', ')}`);

    if (approvedPath) {
        const approved = await loadGlb(resolve(approvedPath));
        for (const manifest of MANIFESTS) {
            const built = gltf.animations.find((c) => c.name === manifest.id);
            const old = approved.animations.find((c) => c.name === APPROVED_CLIP[manifest.id]);
            if (!built || !old) {
                failures.push(`${manifest.id}: no clip to compare with ${APPROVED_CLIP[manifest.id]}`);
                continue;
            }
            try {
                const r = compareClips(built, old);
                console.log(
                    `reproduction ${manifest.id} vs ${APPROVED_CLIP[manifest.id]}: ${r.keys} keys, ${r.duration} s, max rotation difference ${r.rotationDegrees.toFixed(4)} deg (${r.worstBone}), root ${(r.rootMeters * 1000).toFixed(4)} mm`,
                );
                if (r.rotationDegrees > REPRODUCTION_MAX_DEGREES)
                    failures.push(
                        `${manifest.id}: differs from the approved clip by ${r.rotationDegrees.toFixed(3)} deg`,
                    );
                if (r.rootMeters > REPRODUCTION_MAX_METERS)
                    failures.push(
                        `${manifest.id}: root differs from the approved clip by ${(r.rootMeters * 1000).toFixed(3)} mm`,
                    );
            } catch (error) {
                failures.push((error as Error).message);
            }
        }
    }
    for (const message of warnings) console.warn(`WARN ${message}`);
    if (failures.length > 0) {
        for (const message of failures) console.error(`FAIL ${message}`);
        process.exit(1);
    }
    console.log(
        `ok: ${gltf.animations.length} clips pass the hard rules${approvedPath ? ' and reproduce the approved clips' : ''}`,
    );
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
