import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
    BODY_MATERIAL_NAMES,
    DANCE_CLIP_DURATION,
    DANCE_CLIP_NAME,
    NATIVE_BEATS_PER_LOOP,
    NATIVE_BPM,
    STEP_PHASE_OFFSET,
} from './dancingCharacterConfig';

// Reads the vendored GLB directly (JSON chunk plus binary chunk), so the config constants that describe the clip are
// checked against the real asset without needing GLTFLoader or a browser.

interface Accessor {
    bufferView: number;
    byteOffset?: number;
    componentType: number;
    count: number;
    type: string;
    max?: number[];
}
interface Gltf {
    nodes: { name?: string }[];
    materials: { name: string }[];
    accessors: Accessor[];
    bufferViews: { byteOffset?: number; byteLength: number }[];
    animations: {
        name: string;
        channels: { sampler: number; target: { node: number; path: string } }[];
        samplers: { input: number; output: number; interpolation?: string }[];
    }[];
}

const FLOAT = 5126;
const COMPONENTS: Record<string, number> = { SCALAR: 1, VEC3: 3, VEC4: 4 };

function loadGlb(): { gltf: Gltf; binary: DataView } {
    const file = readFileSync(new URL('./assets/RobotExpressive.glb', import.meta.url));
    const bytes = new DataView(file.buffer, file.byteOffset, file.byteLength);
    expect(bytes.getUint32(0, true)).toBe(0x46546c67); // 'glTF'
    const jsonLength = bytes.getUint32(12, true);
    const gltf = JSON.parse(file.subarray(20, 20 + jsonLength).toString('utf8')) as Gltf;
    const binaryStart = 20 + jsonLength;
    expect(bytes.getUint32(binaryStart + 4, true)).toBe(0x004e4942); // 'BIN\0'
    const binaryLength = bytes.getUint32(binaryStart, true);
    return { gltf, binary: new DataView(file.buffer, file.byteOffset + binaryStart + 8, binaryLength) };
}

function readFloats(gltf: Gltf, binary: DataView, index: number): number[][] {
    const accessor = gltf.accessors[index];
    expect(accessor.componentType).toBe(FLOAT);
    const width = COMPONENTS[accessor.type];
    const view = gltf.bufferViews[accessor.bufferView];
    const start = (view.byteOffset ?? 0) + (accessor.byteOffset ?? 0);
    return Array.from({ length: accessor.count }, (_, i) =>
        Array.from({ length: width }, (_, j) => binary.getFloat32(start + (i * width + j) * 4, true)),
    );
}

const { gltf, binary } = loadGlb();
const dance = gltf.animations.find((animation) => animation.name === DANCE_CLIP_NAME);

function rotationChannels() {
    return (dance?.channels ?? [])
        .filter((channel) => channel.target.path === 'rotation')
        .map((channel) => {
            const sampler = dance!.samplers[channel.sampler];
            expect(sampler.interpolation ?? 'LINEAR').toBe('LINEAR');
            return {
                node: gltf.nodes[channel.target.node].name ?? '',
                times: readFloats(gltf, binary, sampler.input).map(([time]) => time),
                rotations: readFloats(gltf, binary, sampler.output),
            };
        });
}

describe('vendored Dance clip', () => {
    it('has a Dance animation whose last keyframe time is DANCE_CLIP_DURATION', () => {
        expect(dance).toBeDefined();
        let maxTime = 0;
        for (const sampler of dance!.samplers) {
            for (const [time] of readFloats(gltf, binary, sampler.input)) maxTime = Math.max(maxTime, time);
        }
        expect(Math.abs(maxTime - DANCE_CLIP_DURATION)).toBeLessThan(1e-4);
    });

    it('loops without a seam: first and last rotation keys of every channel match', () => {
        const channels = rotationChannels();
        expect(channels.length).toBeGreaterThan(0);
        for (const { node, rotations } of channels) {
            const first = rotations[0];
            const last = rotations[rotations.length - 1];
            const dot = first.reduce((sum, value, i) => sum + value * last[i], 0);
            expect(Math.abs(dot), node).toBeGreaterThan(0.999);
        }
    });

    it('has the knee dip, the strongest accent, at the seam where STEP_PHASE_OFFSET = 0 puts the beat', () => {
        expect(STEP_PHASE_OFFSET).toBe(0);
        const knee = rotationChannels().find((channel) => channel.node === 'LowerLeg.L');
        expect(knee).toBeDefined();
        // Rotation angle of a unit quaternion: 2 * acos(|w|).
        const angles = knee!.rotations.map(([, , , w]) => 2 * Math.acos(Math.min(1, Math.abs(w))));
        const peak = angles.indexOf(Math.max(...angles));
        expect(peak < 3 || peak >= angles.length - 3).toBe(true);
    });

    it('has native tempo consistent with the beats per loop and inside 60..180 BPM', () => {
        expect(NATIVE_BPM).toBe((NATIVE_BEATS_PER_LOOP * 60) / DANCE_CLIP_DURATION);
        expect(NATIVE_BPM).toBeGreaterThanOrEqual(60);
        expect(NATIVE_BPM).toBeLessThanOrEqual(180);
    });

    it('has the Main, Grey and Black materials, and the body tint targets exist', () => {
        const names = gltf.materials.map((material) => material.name);
        for (const name of ['Main', 'Grey', 'Black']) expect(names).toContain(name);
        for (const name of BODY_MATERIAL_NAMES) expect(names).toContain(name);
    });
});
