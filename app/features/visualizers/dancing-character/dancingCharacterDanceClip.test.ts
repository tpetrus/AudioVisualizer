import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { buildDanceClip } from './dancingCharacterDanceClip';
import { DANCE_CLIP_BEATS, DANCE_REQUIRED_BONES, NATIVE_BPM } from './dancingCharacterConfig';

function fakeBones(names: readonly string[] = DANCE_REQUIRED_BONES): THREE.Bone[] {
    return names.map((name, i) => {
        const bone = new THREE.Bone();
        bone.name = name;
        // A distinct, non-identity rest rotation so tracks that forget the rest quaternion are caught.
        bone.quaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), 0.1 * (i + 1));
        bone.position.set(0, 0.2, 0);
        return bone;
    });
}

function build() {
    const clips = buildDanceClip(fakeBones());
    if (!clips) throw new Error('expected clips');
    return clips;
}

function track(clip: THREE.AnimationClip, name: string): THREE.KeyframeTrack {
    const found = clip.tracks.find((candidate) => candidate.name === name);
    if (!found) throw new Error(`no track ${name}`);
    return found;
}

// Rotation angle of every key of an additive quaternion track (identity is 0).
function angles(t: THREE.KeyframeTrack): number[] {
    const out: number[] = [];
    for (let i = 0; i < t.times.length; i++) out.push(2 * Math.acos(Math.min(1, Math.abs(t.values[i * 4 + 3]))));
    return out;
}

const KEYS_PER_BEAT = (build().base.tracks[0].times.length - 1) / DANCE_CLIP_BEATS;

// The largest angle inside each beat (beat index 0..3).
function peakPerBeat(t: THREE.KeyframeTrack): number[] {
    const a = angles(t);
    return Array.from({ length: DANCE_CLIP_BEATS }, (_, beat) =>
        Math.max(...a.slice(beat * KEYS_PER_BEAT + 1, (beat + 1) * KEYS_PER_BEAT)),
    );
}

describe('buildDanceClip', () => {
    it('makes two clips of DANCE_CLIP_BEATS beats at the native tempo', () => {
        const { base, accents } = build();
        expect(DANCE_CLIP_BEATS).toBe(4);
        expect(base.duration).toBeCloseTo((DANCE_CLIP_BEATS * 60) / NATIVE_BPM, 10);
        expect(accents.duration).toBeCloseTo(base.duration, 10);
        for (const clip of [base, accents]) {
            for (const t of clip.tracks) expect(t.times[t.times.length - 1]).toBeCloseTo(clip.duration, 10);
        }
    });

    it('loops without a seam: the first key equals the last key on every track', () => {
        const { base, accents } = build();
        expect(base.tracks.length).toBeGreaterThan(10);
        for (const t of [...base.tracks, ...accents.tracks]) {
            const width = t.getValueSize();
            const first = Array.from(t.values.slice(0, width));
            const last = Array.from(t.values.slice(t.values.length - width));
            expect(last, t.name).toEqual(first);
        }
    });

    it('blends the accents additively and the base normally', () => {
        const { base, accents } = build();
        expect(accents.blendMode).toBe(THREE.AdditiveAnimationBlendMode);
        expect(base.blendMode).toBe(THREE.NormalAnimationBlendMode);
    });

    it('builds absolute rotation tracks from the rest quaternion', () => {
        const bones = fakeBones();
        const clips = buildDanceClip(bones)!;
        const knee = bones.find((bone) => bone.name === 'lowerleg01L')!;
        const t = track(clips.base, 'lowerleg01L.quaternion');
        const q = new THREE.Quaternion().fromArray(t.values, 0);
        // At the dip the knee is bent; half a beat later it is back at the rest rotation.
        expect(q.angleTo(knee.quaternion)).toBeGreaterThan(0.3);
        const top = new THREE.Quaternion().fromArray(t.values, (KEYS_PER_BEAT / 2) * 4);
        expect(top.angleTo(knee.quaternion)).toBeLessThan(1e-5);
    });

    it('keeps the root position relative to its rest position', () => {
        const clips = buildDanceClip(fakeBones())!;
        const t = track(clips.base, 'root.position');
        expect(t.values[0]).toBeCloseTo(0);
        expect(t.values[2]).toBeCloseTo(0);
        expect(t.values[1]).toBeLessThan(0.2);
        expect(t.values[KEYS_PER_BEAT * 3 + 1]).toBeCloseTo(t.values[1], 6);
    });

    it('returns null when a required bone is missing', () => {
        for (const missing of DANCE_REQUIRED_BONES) {
            const names = DANCE_REQUIRED_BONES.filter((name) => name !== missing);
            expect(buildDanceClip(fakeBones(names)), missing).toBeNull();
        }
    });

    it('bounces identically on every beat, lowest on the beat', () => {
        const { base } = build();
        const t = track(base, 'root.position');
        const y = (key: number) => t.values[key * 3 + 1];
        for (let beat = 1; beat < DANCE_CLIP_BEATS; beat++) {
            expect(y(beat * KEYS_PER_BEAT)).toBeCloseTo(y(0), 6);
            expect(y(beat * KEYS_PER_BEAT + KEYS_PER_BEAT / 2)).toBeCloseTo(y(KEYS_PER_BEAT / 2), 6);
        }
        expect(y(0)).toBeLessThan(y(KEYS_PER_BEAT / 2));
        // Every other base track repeats per beat as well.
        for (const other of base.tracks) {
            const width = other.getValueSize();
            for (let beat = 1; beat < DANCE_CLIP_BEATS; beat++) {
                for (let k = 0; k < KEYS_PER_BEAT * width; k++) {
                    expect(other.values[beat * KEYS_PER_BEAT * width + k], other.name).toBeCloseTo(other.values[k], 6);
                }
            }
        }
    });

    it('sways the arms on beats 1 and 3 and nods the head on beats 2 and 4', () => {
        const { accents } = build();
        for (const name of ['upperarm01L', 'upperarm01R', 'lowerarm01L', 'lowerarm01R']) {
            const [one, two, three, four] = peakPerBeat(track(accents, `${name}.quaternion`));
            // The elbow only has a slight bend to straighten from the relaxed pose, so its swing is smaller.
            expect(one, name).toBeGreaterThan(name.startsWith('upperarm') ? 0.3 : 0.1);
            expect(three, name).toBeCloseTo(one, 6);
            expect(two, name).toBeLessThan(1e-6);
            expect(four, name).toBeLessThan(1e-6);
        }
        for (const name of ['head', 'neck02']) {
            const [one, two, three, four] = peakPerBeat(track(accents, `${name}.quaternion`));
            expect(two, name).toBeGreaterThan(0.1);
            expect(four, name).toBeCloseTo(two, 6);
            expect(one, name).toBeLessThan(1e-6);
            expect(three, name).toBeLessThan(1e-6);
        }
    });

    it('starts every accent track at no change', () => {
        for (const t of build().accents.tracks) {
            expect(Array.from(t.values.slice(0, 4)).map((v) => Math.abs(v))).toEqual([0, 0, 0, 1]);
        }
    });
});

describe('real MakeHumanDancer.glb', () => {
    async function load() {
        // GLTFLoader decodes the garment textures through an <img> element, which the node environment lacks. This
        // stand-in answers "loaded", so the loader builds its Texture objects (setup.ts unstubs it after each test).
        vi.stubGlobal('self', globalThis);
        vi.stubGlobal('document', {
            createElementNS: () => {
                const listeners = new Map<string, () => void>();
                return {
                    width: 1,
                    height: 1,
                    addEventListener: (type: string, listener: () => void) => listeners.set(type, listener),
                    removeEventListener: (type: string) => listeners.delete(type),
                    set src(_value: string) {
                        queueMicrotask(() => listeners.get('load')?.());
                    },
                };
            },
        });
        const file = readFileSync(new URL('./assets/MakeHumanDancer.glb', import.meta.url));
        const bytes = file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength) as ArrayBuffer;
        const gltf = await new GLTFLoader().parseAsync(bytes, '');
        let skinned: THREE.SkinnedMesh | undefined;
        gltf.scene.traverse((object) => {
            if ((object as THREE.SkinnedMesh).isSkinnedMesh) skinned = object as THREE.SkinnedMesh;
        });
        return { model: gltf.scene, bones: skinned!.skeleton.bones };
    }

    it('has every required bone, and every track names a bone', async () => {
        const { bones } = await load();
        const names = new Set(bones.map((bone) => bone.name));
        for (const name of DANCE_REQUIRED_BONES) expect(names.has(name), name).toBe(true);
        const clips = buildDanceClip(bones)!;
        expect(clips).not.toBeNull();
        for (const t of [...clips.base.tracks, ...clips.accents.tracks]) {
            expect(names.has(t.name.split('.')[0]), t.name).toBe(true);
        }
    });

    it('binds root.position to the bone named root, not to the mixer root', async () => {
        const { model, bones } = await load();
        const binding = new THREE.PropertyBinding(model, 'root.position');
        expect((binding.node as THREE.Object3D).name).toBe('root');
        expect((binding.node as THREE.Bone).isBone).toBe(true);
        expect(binding.node).toBe(bones.find((bone) => bone.name === 'root'));
        binding.unbind();

        // And the mixer really moves it: the bone dips at the beat and the figure does not.
        const clips = buildDanceClip(bones)!;
        const mixer = new THREE.AnimationMixer(model);
        mixer.clipAction(clips.base).play();
        const root = bones.find((bone) => bone.name === 'root')!;
        const restY = root.position.y;
        mixer.setTime(0);
        expect(root.position.y).toBeLessThan(restY - 0.03);
        expect(model.position.y).toBe(0);
        mixer.setTime(0.25);
        expect(root.position.y).toBeCloseTo(restY, 5);
    });

    it('keeps the feet roughly planted through the bounce and lowers the head', async () => {
        const { model, bones } = await load();
        const clips = buildDanceClip(bones)!;
        const mixer = new THREE.AnimationMixer(model);
        mixer.clipAction(clips.base).play();
        const world = (name: string) => {
            const bone = bones.find((candidate) => candidate.name === name)!;
            return new THREE.Vector3().setFromMatrixPosition(bone.matrixWorld);
        };
        mixer.setTime(0.25);
        model.updateMatrixWorld(true);
        const topFoot = world('footL');
        const topHead = world('head');
        mixer.setTime(0);
        model.updateMatrixWorld(true);
        const dipFoot = world('footL');
        expect(Math.abs(dipFoot.y - topFoot.y)).toBeLessThan(0.01);
        expect(Math.abs(dipFoot.z - topFoot.z)).toBeLessThan(0.02);
        expect(world('head').y).toBeLessThan(topHead.y - 0.03);
    });

    it('keeps the hands relaxed beside the body, never in front of the belly', async () => {
        const { model, bones } = await load();
        const clips = buildDanceClip(bones)!;
        const mixer = new THREE.AnimationMixer(model);
        mixer.clipAction(clips.base).play();
        mixer.clipAction(clips.accents).play();
        const world = (name: string) => {
            const bone = bones.find((candidate) => candidate.name === name)!;
            return new THREE.Vector3().setFromMatrixPosition(bone.matrixWorld);
        };
        // The dip, the top and a point inside each beat, so both the base pose and the sway are covered.
        for (const time of [0, 0.125, 0.25, 0.4, 0.5, 0.625, 0.75, 1, 1.125, 1.25, 1.5, 1.75]) {
            mixer.setTime(time);
            model.updateMatrixWorld(true);
            for (const side of ['L', 'R'] as const) {
                const sign = side === 'L' ? 1 : -1;
                const wrist = world(`wrist${side}`);
                const hip = world(`upperleg01${side}`);
                const elbow = world(`lowerarm01${side}`);
                // Outside the hip joint, with room for the clothing's volume, and well apart from the other wrist.
                expect(sign * wrist.x, `${side} wrist x at ${time}`).toBeGreaterThan(sign * hip.x + 0.1);
                // Not raised in front of the belly: the wrist stays about level with the hip joint's depth, and below the chest.
                expect(wrist.z, `${side} wrist z at ${time}`).toBeLessThan(hip.z + 0.2);
                expect(wrist.y, `${side} wrist y at ${time}`).toBeLessThan(world('spine02').y);
                expect(elbow.y, `${side} elbow y at ${time}`).toBeGreaterThan(wrist.y - 0.05);
            }
        }
    });

    it('applies the additive accents on top of the base', async () => {
        const { model, bones } = await load();
        const clips = buildDanceClip(bones)!;
        const mixer = new THREE.AnimationMixer(model);
        const base = mixer.clipAction(clips.base);
        const accents = mixer.clipAction(clips.accents);
        base.play();
        accents.play();
        const arm = bones.find((bone) => bone.name === 'upperarm01L')!;
        accents.weight = 0;
        mixer.setTime(0.25);
        const without = arm.quaternion.clone();
        accents.weight = 1;
        mixer.setTime(0.25);
        expect(arm.quaternion.angleTo(without)).toBeGreaterThan(0.5);
    });
});
