// The pure parts of build.ts that need no network or GLB: the command line and the up-front bone check.

import { dirname, join, resolve } from 'node:path';

export const DEFAULT_MODEL = resolve('app/features/visualizers/dancing-character/assets/MakeHumanDancer.glb');
export const DEFAULT_OUTPUT = resolve('app/features/visualizers/dancing-character/assets/MakeHumanDances.glb');

const SIDES = ['L', 'R'] as const;

// Contract C-BONES: every bone a character GLB must carry (named as GLTFLoader loads them, dots removed) for the dances
// to be retargeted onto it. Checked before any download or retargeting so a character that lacks one fails at once with
// the whole list of missing names instead of deep inside the retarget.
export const REQUIRED_BONES: readonly string[] = [
    'root',
    'spine05',
    'spine04',
    'spine03',
    'spine02',
    'spine01',
    'neck01',
    'neck02',
    'neck03',
    'head',
    'pelvisL',
    'pelvisR',
    ...SIDES.flatMap((s) => [
        `clavicle${s}`,
        `shoulder01${s}`,
        `upperarm01${s}`,
        `upperarm02${s}`,
        `lowerarm01${s}`,
        `lowerarm02${s}`,
        `wrist${s}`,
        `finger2-1${s}`,
        `finger3-1${s}`,
        `finger5-1${s}`,
        `upperleg01${s}`,
        `upperleg02${s}`,
        `lowerleg01${s}`,
        `lowerleg02${s}`,
        `foot${s}`,
        `toe1-1${s}`,
    ]),
];

// The C-BONES names that `boneNames` does not contain, in contract order.
export function missingBones(boneNames: Iterable<string>): string[] {
    const have = new Set(boneNames);
    return REQUIRED_BONES.filter((name) => !have.has(name));
}

export interface BuildArgs {
    // Local directory with the CMU inputs; undefined downloads them into memory.
    dir: string | undefined;
    model: string;
    out: string;
    // True when the model is the committed MakeHuman one (the only one the approved spike clips were made for).
    defaultModel: boolean;
    approved: string | undefined;
}

export function parseBuildArgs(args: readonly string[]): BuildArgs {
    const valued = ['--out', '--model', '--approved'];
    const option = (name: string): string | undefined => {
        const at = args.indexOf(name);
        if (at < 0) return undefined;
        const value = args[at + 1];
        if (value === undefined || value.startsWith('--')) throw new Error(`${name} needs a value`);
        return value;
    };
    const flagged = new Set(valued.flatMap((name) => [name, option(name)]));
    const unknown = args.find((a) => a.startsWith('--') && !valued.includes(a));
    if (unknown) throw new Error(`unknown option ${unknown}`);
    const model = resolve(option('--model') ?? DEFAULT_MODEL);
    const defaultModel = model === DEFAULT_MODEL;
    const dir = args.find((a) => !flagged.has(a));
    // A character's dances sit next to its model as dances.glb (contract C-BONES); the MakeHuman file keeps its name.
    const fallback = defaultModel ? DEFAULT_OUTPUT : join(dirname(model), 'dances.glb');
    return {
        dir: dir === undefined ? undefined : resolve(dir),
        model,
        out: resolve(option('--out') ?? fallback),
        defaultModel,
        approved: option('--approved'),
    };
}
