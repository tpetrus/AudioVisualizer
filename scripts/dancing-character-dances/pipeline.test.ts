import { beforeAll, describe, expect, it } from 'vitest';
import { AnimationClip, Quaternion, QuaternionKeyframeTrack, Vector3, VectorKeyframeTrack } from 'three';
import { DANCE_REQUIRED_BONES } from '../../app/features/visualizers/dancing-character/dancingCharacterConfig';
import { scaleAmplitude } from './amplitude';
import { buildTorso } from './clearance';
import type { Torso } from './clearance';
import type { Clip } from './clip';
import { groundLock, mirror } from './edits';
import { KEYS_PER_BEAT, beatKeys, makeLoop, quatAngleDegrees, warpPosition } from './loop';
import type { Retargeted } from './retarget';
import { loadTargetRig } from './rig';
import type { TargetRig } from './rig';
import { FOOT_SKATE_MAX_METERS, validateClip } from './validate';

const MODEL = new URL('../../app/features/visualizers/dancing-character/assets/MakeHumanDancer.glb', import.meta.url);

let rig: TargetRig;
let torso: Torso;
beforeAll(async () => {
    rig = await loadTargetRig(decodeURIComponent(MODEL.pathname.replace(/^\/([A-Za-z]:)/, '$1')));
    torso = buildTorso(rig);
}, 60_000);

// A track turning about X by `degrees(k)` at key k.
function xTrack(keys: number, degrees: (k: number) => number): Float32Array {
    const out = new Float32Array(keys * 4);
    const q = new Quaternion();
    for (let k = 0; k < keys; k++) {
        q.setFromAxisAngle(new Vector3(1, 0, 0), (degrees(k) * Math.PI) / 180).toArray(out, k * 4);
    }
    return out;
}

const clipOf = (keys: number, quaternions: Map<string, Float32Array>, rootPosition: Float32Array): Clip => ({
    id: 'test',
    keys,
    times: Float32Array.from({ length: keys }, (_, k) => k / 30),
    quaternions,
    rootPosition,
    pelvisHeight: new Float64Array(keys),
});

describe('beat table and warp maths', () => {
    it('turns source frames into clip keys relative to the window start', () => {
        // 120 fps source, 30 keys per second: four source frames per key.
        expect(beatKeys([1000, 1060, 1120], 120, 1000)).toEqual([0, 15, 30]);
        expect(beatKeys([100, 130], 60, 100)).toEqual([0, 15]);
    });

    it('samples a straight line between the beat keys, so a longer beat plays slower', () => {
        const table = [0, 10, 40];
        expect(warpPosition(table, 0)).toBe(0);
        expect(warpPosition(table, KEYS_PER_BEAT / 2)).toBe(5);
        expect(warpPosition(table, KEYS_PER_BEAT)).toBe(10);
        expect(warpPosition(table, KEYS_PER_BEAT * 1.5)).toBe(25);
        // The loop's last key is the end of the last beat.
        expect(warpPosition(table, KEYS_PER_BEAT * 2)).toBe(40);
    });
});

describe('loop closing', () => {
    const r = { restPelvis: new Vector3(0, 1, 0), restRootHead: new Vector3(0, 1, 0) } as unknown as Retargeted;

    it('closes a stretch that ends in another pose: the last key is the first, 0.5 s per beat', () => {
        const keys = 61;
        const rootRotation = xTrack(keys, () => 0);
        const spine = xTrack(keys, (k) => k);
        const source = clipOf(
            keys,
            new Map([
                ['root', rootRotation],
                ['spine05', spine],
            ]),
            new Float32Array(keys * 3),
        );
        source.pelvisHeight.fill(1);
        const { clip, report } = makeLoop(source, r, rig, 'test', [0, 15, 30]);
        expect(clip.keys).toBe(2 * KEYS_PER_BEAT + 1);
        expect(clip.times[clip.keys - 1]).toBe(1);
        expect(report.seamBefore).toBeCloseTo(30, 3);
        expect(report.seamAfter).toBeLessThan(0.1);
        const track = clip.quaternions.get('spine05') as Float32Array;
        expect(quatAngleDegrees(track, 0, track, (clip.keys - 1) * 4)).toBeLessThan(0.05);
        expect(clip.pelvisHeight[clip.keys - 1]).toBe(clip.pelvisHeight[0]);
    });

    it('refuses a beat table that leaves the source clip', () => {
        const source = clipOf(10, new Map([['root', xTrack(10, () => 0)]]), new Float32Array(30));
        expect(() => makeLoop(source, r, rig, 'test', [0, 5, 20])).toThrow(/leaves the source clip/);
    });
});

describe('ground lock', () => {
    it('brings hips that float and bob back to the floor within the tolerance', () => {
        const keys = 31;
        const rootPosition = new Float32Array(keys * 3);
        const rest = rig.restHead.get('root') as Vector3;
        for (let k = 0; k < keys; k++) {
            rootPosition.set([rest.x, rest.y + 0.06 + 0.04 * Math.sin((k / 30) * 2 * Math.PI), rest.z], k * 3);
        }
        const clip = clipOf(keys, new Map(), rootPosition);
        const report = groundLock(rig, clip, 0.01);
        expect(report.floatBefore).toBeGreaterThan(0.05);
        expect(report.floatAfter).toBeLessThanOrEqual(0.01 + 1e-6);
        expect(clip.rootPosition[1]).toBeCloseTo(clip.rootPosition[(keys - 1) * 3 + 1], 9);
    });
});

describe('amplitude scaling', () => {
    it('halves the swing of the listed bones and keeps the loop closed', () => {
        const keys = 9;
        const swing = xTrack(keys, (k) => 20 * Math.sin((k / 8) * 2 * Math.PI));
        const other = xTrack(keys, (k) => 20 * Math.sin((k / 8) * 2 * Math.PI));
        const clip = clipOf(
            keys,
            new Map([
                ['spine05', swing],
                ['head', other],
            ]),
            new Float32Array(keys * 3),
        );
        const scaled = scaleAmplitude(clip, rig, 'scaled', [{ bones: ['spine05'], scale: 0.5 }]);
        const before = scaled.quaternions.get('spine05') as Float32Array;
        const peak = quatAngleDegrees(swing, 2 * 4, swing, 6 * 4);
        expect(quatAngleDegrees(before, 2 * 4, before, 6 * 4)).toBeCloseTo(peak / 2, 1);
        expect(quatAngleDegrees(before, 0, before, 8 * 4)).toBeLessThan(1e-3);
        // A bone that is not listed is untouched, and the input clip is not modified.
        expect(scaled.quaternions.get('head')).toEqual(other);
        expect(clip.quaternions.get('spine05')).toEqual(swing);
        expect(() => scaleAmplitude(clip, rig, 'x', [{ bones: ['nope'], scale: 1 }])).toThrow(/no nope track/);
    });
});

describe('quaternion mirror', () => {
    it('keeps a turn about the mirror plane normal flipped and a turn about X as it is, and is its own inverse', () => {
        const aboutX = new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), 0.7);
        const aboutY = new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), 0.7);
        expect(mirror(aboutX).angleTo(aboutX)).toBeCloseTo(0, 9);
        expect(mirror(aboutY).angleTo(aboutY.clone().invert())).toBeCloseTo(0, 9);
        const q = new Quaternion(0.1, 0.2, 0.3, 0.9).normalize();
        expect(mirror(mirror(q)).angleTo(q)).toBeCloseTo(0, 6);
    });
});

describe('validation rules', () => {
    const KEYS = 61;
    const EXPECTED = { id: 'test', beats: 4 };

    // A clip standing in the rest pose, with `edit` free to disturb it.
    function restClip(edit: (quaternions: Map<string, Float32Array>, root: Float32Array) => void): AnimationClip {
        const times = Float32Array.from({ length: KEYS }, (_, k) => k / 30);
        const quaternions = new Map<string, Float32Array>();
        for (const bone of DANCE_REQUIRED_BONES) {
            const q = rig.restLocal.get(bone) as Quaternion;
            const track = new Float32Array(KEYS * 4);
            for (let k = 0; k < KEYS; k++) q.toArray(track, k * 4);
            quaternions.set(bone, track);
        }
        const rest = rig.restHead.get('root') as Vector3;
        const root = new Float32Array(KEYS * 3);
        for (let k = 0; k < KEYS; k++) rest.toArray(root, k * 3);
        edit(quaternions, root);
        const tracks = [...quaternions].map(
            ([bone, values]) => new QuaternionKeyframeTrack(`${bone}.quaternion`, times, values),
        );
        tracks.push(new VectorKeyframeTrack('root.position', times, root));
        return new AnimationClip('test', 2, tracks);
    }

    const failuresOf = (clip: AnimationClip): string[] => validateClip(rig, torso, clip, EXPECTED).failures;

    it('passes a still loop in the rest pose', () => {
        const report = validateClip(
            rig,
            torso,
            restClip(() => {}),
            EXPECTED,
        );
        expect(report.failures).toEqual([]);
        expect(report.metrics?.rootXZMeters).toBeLessThan(1e-6);
    });

    it('root travel: a sway within 0.10 m of the rest position passes, a drift past it fails', () => {
        const sway = (amount: number) =>
            restClip((_, root) => {
                const x0 = root[0];
                for (let k = 0; k < KEYS; k++) root[k * 3] = x0 + amount * Math.sin((k / 60) * Math.PI);
            });
        expect(failuresOf(sway(0.08)).filter((f) => /root X\/Z/.test(f))).toEqual([]);
        expect(failuresOf(sway(0.12)).some((f) => /root X\/Z travels/.test(f))).toBe(true);
    });

    it('root travel: first and last keys must match within 1 mm', () => {
        const shifted = restClip((_, root) => {
            root[(KEYS - 1) * 3 + 2] += 0.005;
        });
        expect(failuresOf(shifted).some((f) => /root X\/Z first != last/.test(f))).toBe(true);
    });

    it('foot skate: a planted foot passes, a foot that slides during contact fails', () => {
        expect(FOOT_SKATE_MAX_METERS).toBe(0.16);
        const slide = (amount: number) =>
            restClip((_, root) => {
                const z0 = root[2];
                for (let k = 0; k < KEYS; k++) root[k * 3 + 2] = z0 + amount * Math.sin((k / 60) * Math.PI);
            });
        expect(failuresOf(slide(0.08)).filter((f) => /foot skate/.test(f))).toEqual([]);
        expect(failuresOf(slide(0.2)).some((f) => /foot skate/.test(f))).toBe(true);
    });

    it('seam: a last key within 0.5 degrees of the first passes, one 20 degrees away fails', () => {
        const turned = (degrees: number) =>
            restClip((quaternions) => {
                const track = quaternions.get('spine05') as Float32Array;
                const q = new Quaternion().fromArray(track, (KEYS - 1) * 4);
                q.multiply(new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), (degrees * Math.PI) / 180));
                q.toArray(track, (KEYS - 1) * 4);
            });
        expect(failuresOf(turned(0.2)).filter((f) => /differ|seam/.test(f))).toEqual([]);
        const failures = failuresOf(turned(20));
        expect(failures.some((f) => /first\/last differ/.test(f))).toBe(true);
        expect(failures.some((f) => /loop seam/.test(f))).toBe(true);
    });

    it('fails a clip of the wrong length', () => {
        const report = validateClip(
            rig,
            torso,
            restClip(() => {}),
            { id: 'test', beats: 8 },
        );
        expect(report.failures.some((f) => /duration/.test(f))).toBe(true);
        expect(report.failures.some((f) => /keys, expected 121/.test(f))).toBe(true);
    });
});
