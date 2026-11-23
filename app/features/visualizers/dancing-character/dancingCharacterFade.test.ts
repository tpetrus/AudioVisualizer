import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import {
    DANCE_FADE_MAX_SECONDS,
    DANCE_REQUIRED_BONES,
    DANCES,
    MAX_DANCE_BPM,
    MIN_TIME_SCALE,
    NATIVE_BPM,
} from './dancingCharacterConfig';
import { fadeSeconds } from './dancingCharacterFade';

describe('fadeSeconds', () => {
    it('is one beat of clip time on the wall clock: 0.5 s at the native speed, shorter when faster', () => {
        expect(fadeSeconds(1)).toBeCloseTo(0.5, 12);
        expect(fadeSeconds(2)).toBeCloseTo(0.25, 12);
        expect(fadeSeconds(MAX_DANCE_BPM / NATIVE_BPM)).toBeCloseTo(0.5 / (MAX_DANCE_BPM / NATIVE_BPM), 12);
    });

    it('never takes longer than the cap, even when the dance is nearly frozen', () => {
        expect(fadeSeconds(0.25)).toBe(DANCE_FADE_MAX_SECONDS);
        expect(fadeSeconds(MIN_TIME_SCALE)).toBe(DANCE_FADE_MAX_SECONDS);
        expect(fadeSeconds(0)).toBe(DANCE_FADE_MAX_SECONDS);
        expect(fadeSeconds(-3)).toBe(DANCE_FADE_MAX_SECONDS);
    });
});

// AC3: a cross-fade between any two shipped clips never makes a bone turn faster, from one frame to the next, than a
// fixed bound. The mixer blends two actions of weights (1 - w) and w by spherical interpolation, which is what this
// test does to the clips' own keys, so it needs no rig.
const FRAME = 1 / 60;
// The fastest the dance runs: MAX_DANCE_BPM at the native tempo, the largest time scale the timing produces.
const MAX_TIME_SCALE = MAX_DANCE_BPM / NATIVE_BPM;

async function loadClips(): Promise<Map<string, THREE.AnimationClip>> {
    const file = readFileSync(new URL('./assets/MakeHumanDances.glb', import.meta.url));
    const bytes = file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength) as ArrayBuffer;
    const { animations } = await new GLTFLoader().parseAsync(bytes, '');
    return new Map(animations.map((clip) => [clip.name, clip]));
}

// The rotation of every required bone in a clip at a time, looped. One interpolant per bone, made once.
// The rest rotation of every node in the character, read from the GLB's JSON chunk so no rig (and no texture decoding)
// is needed (names sanitized the way GLTFLoader does). A clip without a track for a bone (the salsa helper bones are in
// one clip only) leaves that bone at this rest, which is what the mixer blends the other clip against during a fade.
function loadRestRotations(): Map<string, number[]> {
    const file = readFileSync(new URL('./assets/MakeHumanDancer.glb', import.meta.url));
    const jsonLength = file.readUInt32LE(12);
    const json = JSON.parse(file.subarray(20, 20 + jsonLength).toString('utf8')) as {
        nodes: { name?: string; rotation?: number[] }[];
    };
    return new Map(
        json.nodes.map((node) => [
            THREE.PropertyBinding.sanitizeNodeName(node.name ?? ''),
            node.rotation ?? [0, 0, 0, 1],
        ]),
    );
}

function makeSampler(clip: THREE.AnimationClip, tracks: string[], rest: Map<string, number[]>) {
    const interpolants = tracks.map((name) => {
        let track = clip.tracks.find((candidate) => candidate.name === name);
        if (!track) {
            const q = rest.get(name.replace('.quaternion', ''));
            if (!q) throw new Error(`${name} is not a node of the character`);
            track = new THREE.QuaternionKeyframeTrack(name, [0, 1], [...q, ...q]);
        }
        // The clips are linear glTF rotation keys, which the mixer evaluates with this interpolant.
        return new THREE.QuaternionLinearInterpolant(track.times, track.values, 4, new Float32Array(4));
    });
    return (time: number, out: THREE.Quaternion[]): void => {
        const t = time % clip.duration;
        interpolants.forEach((interpolant, i) => out[i].fromArray(interpolant.evaluate(t)));
    };
}

const newPose = (count: number) => Array.from({ length: count }, () => new THREE.Quaternion());

function angleDegrees(a: THREE.Quaternion, b: THREE.Quaternion): number {
    return (2 * Math.acos(Math.min(1, Math.abs(a.dot(b)))) * 180) / Math.PI;
}

// The largest turn of the bones from index `from` up to (not including) `to`.
function largestChange(previous: THREE.Quaternion[], next: THREE.Quaternion[], from: number, to: number): number {
    let worst = 0;
    for (let i = from; i < to; i++) worst = Math.max(worst, angleDegrees(previous[i], next[i]));
    return worst;
}

describe('cross-fade rotation speed (AC3)', () => {
    // Starts of the fade across the clock (a switch happens on a bar line, every 2 s, but the sweep covers any offset),
    // and the speeds the dance runs at: the native one, the fastest, and a slow one.
    const STARTS = Array.from({ length: 32 }, (_, i) => i * 0.125);
    const SCALES = [1, MAX_TIME_SCALE, 0.6];

    it('stays under 12 degrees per frame at 60 fps for any pair of shipped clips, at any speed (14 on helper bones)', async () => {
        const clips = await loadClips();
        // Every rotation track any shipped clip has, so no bone escapes a bound: the bones every dance drives first, then
        // the helper bones only some clips drive (the salsa's shoulders and the like), which get their own bound below.
        const required = DANCE_REQUIRED_BONES.map((bone) => `${bone}.quaternion`);
        const helpers = [
            ...new Set(
                [...clips.values()].flatMap((clip) =>
                    clip.tracks.filter((t) => t.name.endsWith('.quaternion')).map((t) => t.name),
                ),
            ),
        ].filter((name) => !required.includes(name));
        const trackNames = [...required, ...helpers];
        const split = required.length;
        const rest = loadRestRotations();
        const samplers = new Map(
            DANCES.map((dance) => [dance.id, makeSampler(clips.get(dance.id)!, trackNames, rest)]),
        );
        const [a, b, blend] = [newPose(trackNames.length), newPose(trackNames.length), newPose(trackNames.length)];
        const before = newPose(trackNames.length);

        let worstFade = 0;
        let worstInClip = 0;
        let worstHelperFade = 0;
        let worstHelperInClip = 0;
        for (const scale of SCALES) {
            // The in-clip motion: how far any bone turns in one frame while a clip plays alone at this speed.
            for (const dance of DANCES) {
                const sample = samplers.get(dance.id)!;
                sample(0, before);
                for (let time = FRAME * scale; time < dance.beats * 0.5; time += FRAME * scale) {
                    sample(time, blend);
                    worstInClip = Math.max(worstInClip, largestChange(before, blend, 0, split));
                    worstHelperInClip = Math.max(worstHelperInClip, largestChange(before, blend, split, blend.length));
                    for (let i = 0; i < blend.length; i++) before[i].copy(blend[i]);
                }
            }
            // The fade: weights climb linearly over the fade's wall-clock seconds while both clips keep playing.
            const frames = Math.ceil(fadeSeconds(scale) / FRAME);
            for (const from of DANCES) {
                for (const to of DANCES) {
                    if (from.id === to.id) continue;
                    for (const start of STARTS) {
                        for (let frame = 0; frame <= frames; frame++) {
                            const time = start + frame * FRAME * scale;
                            const weight = Math.min(1, (frame * FRAME) / fadeSeconds(scale));
                            samplers.get(from.id)!(time, a);
                            samplers.get(to.id)!(time, b);
                            for (let i = 0; i < blend.length; i++) blend[i].copy(a[i]).slerp(b[i], weight);
                            if (frame > 0) {
                                worstFade = Math.max(worstFade, largestChange(before, blend, 0, split));
                                worstHelperFade = Math.max(
                                    worstHelperFade,
                                    largestChange(before, blend, split, blend.length),
                                );
                            }
                            for (let i = 0; i < blend.length; i++) before[i].copy(blend[i]);
                        }
                    }
                }
            }
        }
        // The bound is 12 degrees per frame (720 degrees per second). The shipped clips themselves reach about 9.6 degrees
        // per frame on their fastest bone (a mocap hand or foot at the fastest speed), and a fade measured 11.2 at the
        // time of writing: the blend adds at most the pose difference spread over the fade, a few degrees, so a fade is
        // never much faster than the dance already is. The second check ties the bound to the clips, so it moves with
        // them: a fade may exceed the fastest in-clip frame by at most a quarter.
        expect(worstFade).toBeLessThan(12);
        expect(worstFade).toBeLessThanOrEqual(worstInClip * 1.25);
        // The helper bones are the salsa mocap's own: alone, at the fastest speed, they already turn about 12.6 degrees
        // in a frame (a shoulder), so the 12 degree bound cannot hold for them without changing the approved clip. They
        // are small bones next to the ones above, and a fade measured 13.1 on them at the time of writing; they keep the
        // same tie to their own in-clip motion and a fixed 14 degree ceiling.
        expect(helpers.length).toBeGreaterThan(0);
        expect(worstHelperFade).toBeLessThan(14);
        expect(worstHelperFade).toBeLessThanOrEqual(worstHelperInClip * 1.25);
    });
});
