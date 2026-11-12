// What the four shipped dance clips are made of: which CMU files, which stretch of them (a source frame for every beat of
// the loop) and every processing parameter. The CMU files are pinned by sha256; raw mocap is never committed.
//
// The beat tables and parameters reproduce the loops that were approved by eye in the S0g spike (see
// docs/plans/natural-dance/contracts.md, Amendment 3). Changing a number here changes how the dance looks.

import type { AmplitudeGroup } from './amplitude';

export type DanceId = 'lambada' | 'twist' | 'cabbage-patch' | 'salsa';

export interface CmuFile {
    // CMU subject folder: http://mocap.cs.cmu.edu/subjects/<subject>/<name>
    subject: string;
    sha256: string;
}

// The website's https certificate is broken, so the files are fetched over plain http and the hash is the integrity check.
export const CMU_BASE_URL = 'http://mocap.cs.cmu.edu/subjects';

export const CMU_FILES: Readonly<Record<string, CmuFile>> = {
    '55.asf': { subject: '55', sha256: 'fd9bc721979964c2ab0723437bc881e5cabf4b0a1f1eef001f91a21c11600a32' },
    '55_02.amc': { subject: '55', sha256: '8c5267b81b22ea3511eafdcfe2e277f3b754a97038ec0e86ff70c3a905ff2f4c' },
    '60.asf': { subject: '60', sha256: 'bf20990ec1b9ed0adcb8227f3ebc2f502d0955cbf7499623a07d099d7b104c6c' },
    '60_01.amc': { subject: '60', sha256: 'd06e823aeb985cfa9382ac54c09a0ed4cd716e34e68a90f535065974dfc7201f' },
    '60_02.amc': { subject: '60', sha256: '6a7b6b0d0a420cce041bda648255082370aad72185917a678af9c1bcc0929199' },
    '15.asf': { subject: '15', sha256: '70693bac5f31e3b0892c398fb08b52da7b4c00003f55ce57e36ab58e63d93960' },
    '15_04.amc': { subject: '15', sha256: 'b32fa0654dce9db467aecfdd3bb730f33e6cc0c60b3ac5aa14da90ed576ca05e' },
};

export const cmuUrl = (name: string): string => {
    const file = CMU_FILES[name];
    if (!file) throw new Error(`unknown CMU file ${name}`);
    return `${CMU_BASE_URL}/${file.subject}/${name}`;
};

export interface TakeSpec {
    skeleton: string;
    motion: string;
    // The AMC files carry no frame rate, so it is the one in the CMU listing's "framerate" column.
    fps: number;
    // Source frames (inclusive) the take is cut to before retargeting. The retarget's facing, foot calibration and floor
    // level are measured over what it is given, so this is part of the recipe. Absent: the whole take.
    window?: readonly [from: number, to: number];
    // The source frame of every beat of the loop (beats + 1 entries; the last is where the loop closes). The loop
    // plays from frame to frame at 0.5 s per beat.
    beatFrames: readonly number[];
}

export interface HeadSpec {
    // Share of the head's mean sideways offset from the chest that stays, scale of its remaining movement, and how much
    // of the correction the neck takes (the head takes the rest).
    keep: number;
    scale: number;
    neckShare: number;
}

export interface ArmMirrorSpec {
    // The arm that moves drives the other one, mirrored, this many beats later in the loop.
    driver: 'L' | 'R';
    shiftBeats: number;
    // Soft caps: the upper arm's lift from hanging (degrees) and the elbow's sideways distance from the shoulder (meters).
    liftCapDegrees: number;
    elbowCapMeters: number;
}

export interface DanceManifest {
    id: DanceId;
    label: string;
    beats: 4 | 8;
    license: 'CMU-mocap';
    // The take that gives the hips and legs (and everything else unless `upper` is set).
    take: TakeSpec;
    // Salsa: the spine, head, shoulders, arms and hands come from this take instead. Its own stretch of legs read as
    // walking, so only its upper body (approved by eye) is kept.
    upper?: TakeSpec;
    // Hips height locked to the lowest foot joint (meters of slack that keeps the curve smooth), or null for as captured.
    groundLock: { tolerance: number } | null;
    // Per-bone-group amplitude scaling, applied before the arm passes.
    amplitude: readonly AmplitudeGroup[];
    mirror?: ArmMirrorSpec;
    head?: HeadSpec;
}

// Beat table for a stretch that runs at a steady speed: frame `start` plus `framesPerBeat` per beat.
export const evenBeats = (start: number, framesPerBeat: number, beats: number): number[] =>
    Array.from({ length: beats + 1 }, (_, k) => start + k * framesPerBeat);

export const SHOULDERS_AND_ARMS = [
    'clavicleL',
    'clavicleR',
    'upperarm01L',
    'upperarm01R',
    'lowerarm01L',
    'lowerarm01R',
];
export const SPINE_AND_HEAD = ['spine05', 'spine04', 'spine03', 'spine02', 'spine01', 'neck02', 'head'];

// The order is the Auto rotation order (docs/plans/natural-dance/contracts.md, Amendment 3).
export const MANIFESTS: readonly DanceManifest[] = [
    {
        id: 'lambada',
        label: 'Lambada',
        beats: 8,
        license: 'CMU-mocap',
        // 55_02 "lambada dance": source frames 1680-2116 (14.0-17.6 s), 54.5 frames per beat (131.5 BPM).
        take: { skeleton: '55.asf', motion: '55_02.amc', fps: 120, beatFrames: evenBeats(1680, 54.5, 8) },
        // Approved as captured: no ground lock, no amplitude change; only the arm clearance pass runs.
        groundLock: null,
        amplitude: [],
    },
    {
        id: 'twist',
        label: 'Twist',
        beats: 8,
        license: 'CMU-mocap',
        // 15_04, the Twist stretch of the stick-figure video (2:12.5-2:18.5); the loop is frames 16204-16580, 47 per beat.
        take: {
            skeleton: '15.asf',
            motion: '15_04.amc',
            fps: 120,
            window: [15900, 16620],
            beatFrames: evenBeats(16204, 47, 8),
        },
        // The Twist's hips rose and floated at the top of its dance.
        groundLock: { tolerance: 0.01 },
        // The arms flap wildly in the capture: much smaller; the spine a little calmer; hips, legs and feet stay full.
        amplitude: [
            { bones: SHOULDERS_AND_ARMS, scale: 0.6 },
            { bones: SPINE_AND_HEAD, scale: 0.85 },
        ],
        // The head was turned far to the side of the chest.
        head: { keep: 0.1, scale: 0.5, neckShare: 0.5 },
    },
    {
        id: 'cabbage-patch',
        label: 'Cabbage Patch',
        beats: 4,
        license: 'CMU-mocap',
        // 15_04, the Cabbage Patch stretch (1:55.0-2:07.0); the loop is frames 14160-14460, 75 per beat (96 BPM).
        take: {
            skeleton: '15.asf',
            motion: '15_04.amc',
            fps: 120,
            window: [13800, 15240],
            beatFrames: evenBeats(14160, 75, 4),
        },
        groundLock: { tolerance: 0.01 },
        amplitude: [],
    },
    {
        id: 'salsa',
        label: 'Salsa',
        beats: 4,
        license: 'CMU-mocap',
        // 60_02 "salsa dance": the best in-place stretch for the legs and hips, frames 254-366, 28 per beat (128.6 BPM).
        take: { skeleton: '60.asf', motion: '60_02.amc', fps: 60, beatFrames: evenBeats(254, 28, 4) },
        // 60_01 "salsa dance", frames 1976-2098 (30.5 per beat): the upper body that was approved by eye.
        upper: { skeleton: '60.asf', motion: '60_01.amc', fps: 60, beatFrames: evenBeats(1976, 30.5, 4) },
        groundLock: { tolerance: 0.01 },
        // The moving arm at 0.6 amplitude with its neutral halfway to hanging; the other arm is its mirror image.
        amplitude: [{ bones: SHOULDERS_AND_ARMS, scale: 0.6, restBlend: 0.5 }],
        mirror: { driver: 'L', shiftBeats: 2, liftCapDegrees: 55, elbowCapMeters: 0.1 },
    },
];
