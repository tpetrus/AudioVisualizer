// Turns the parsed MakeHuman data into a binary glTF (GLB): one skinned mesh, one skin over every bone and one material.
// The container is written by hand (JSON chunk + BIN chunk, both 4-byte aligned) because three's GLTFExporter needs
// FileReader, which Node lacks.

import { Matrix4, Quaternion, Vector3 } from 'three';
import { UNIT_SCALE } from './makehuman';
import type { BaseMesh, Bone } from './makehuman';

// MakeHuman's default skin is tinted at runtime by a LiteSphere shader and its .mhmat carries no diffuse color, so the
// base color is a fixed mid skin tone chosen here (sRGB), converted to linear for glTF.
const SKIN_SRGB = [0xc6 / 255, 0x8e / 255, 0x72 / 255] as const;
const SKIN_ROUGHNESS = 0.6;

const FLOAT = 5126;
const UNSIGNED_BYTE = 5121;
const UNSIGNED_SHORT = 5123;
const UNSIGNED_INT = 5125;
const ARRAY_BUFFER = 34962;
const ELEMENT_ARRAY_BUFFER = 34963;

export interface ModelStats {
    vertices: number;
    triangles: number;
    bones: number;
    // Vertices that had no weight in the source and copied the nearest weighted vertex.
    unweightedVertices: number;
}

const toLinear = (c: number): number => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));

function align4(n: number): number {
    return (n + 3) & ~3;
}

// Keeps the four strongest influences per vertex (ties go to the lower bone index) and renormalizes them to sum 1.
function topFour(influences: [number, number][]): [number, number][] {
    const sorted = [...influences].sort((a, b) => b[1] - a[1] || a[0] - b[0]).slice(0, 4);
    const total = sorted.reduce((sum, [, weight]) => sum + weight, 0);
    return sorted.map(([bone, weight]) => [bone, weight / total]);
}

export function buildGlb(
    mesh: BaseMesh,
    bones: Bone[],
    sourceWeights: Map<number, [string, number][]>,
): { glb: Buffer; stats: ModelStats } {
    const boneIndex = new Map(bones.map((bone, i) => [bone.name, i]));

    // Reindex to the vertices the body triangles use, in ascending order of their original index.
    const used = [...new Set(mesh.bodyTriangles)].sort((a, b) => a - b);
    const remap = new Map(used.map((original, i) => [original, i]));
    const vertexCount = used.length;

    const positions = new Float32Array(vertexCount * 3);
    used.forEach((original, i) => {
        for (let k = 0; k < 3; k++) positions[i * 3 + k] = mesh.vertices[original * 3 + k] * UNIT_SCALE;
    });

    // glTF front faces are counter-clockwise. Check the winding by the signed volume and flip it if it is inside out.
    const triangles = Uint32Array.from(mesh.bodyTriangles.map((original) => remap.get(original) as number));
    const vertex = (i: number): Vector3 => new Vector3(positions[i * 3], positions[i * 3 + 1], positions[i * 3 + 2]);
    let volume = 0;
    for (let t = 0; t < triangles.length; t += 3) {
        volume += vertex(triangles[t]).dot(
            new Vector3().crossVectors(vertex(triangles[t + 1]), vertex(triangles[t + 2])),
        );
    }
    if (volume < 0) {
        for (let t = 0; t < triangles.length; t += 3) {
            const swap = triangles[t + 1];
            triangles[t + 1] = triangles[t + 2];
            triangles[t + 2] = swap;
        }
    }

    // Smooth normals: the sum of the (area-weighted) face normals around each vertex.
    const normals = new Float32Array(vertexCount * 3);
    const accumulated = new Float64Array(vertexCount * 3);
    const edge1 = new Vector3();
    const edge2 = new Vector3();
    const face = new Vector3();
    for (let t = 0; t < triangles.length; t += 3) {
        const a = vertex(triangles[t]);
        edge1.subVectors(vertex(triangles[t + 1]), a);
        edge2.subVectors(vertex(triangles[t + 2]), a);
        face.crossVectors(edge1, edge2);
        for (let k = 0; k < 3; k++) {
            accumulated[triangles[t + k] * 3] += face.x;
            accumulated[triangles[t + k] * 3 + 1] += face.y;
            accumulated[triangles[t + k] * 3 + 2] += face.z;
        }
    }
    for (let i = 0; i < vertexCount; i++) {
        const n = new Vector3(accumulated[i * 3], accumulated[i * 3 + 1], accumulated[i * 3 + 2]).normalize();
        normals.set([n.x, n.y, n.z], i * 3);
    }

    // Skinning: top four influences per vertex. A vertex without any weight copies the influences of the nearest
    // weighted vertex (squared distance, lowest index wins ties), so it moves with the body part it sits on.
    const influences: ([number, number][] | null)[] = used.map((original) => {
        const list = sourceWeights.get(original);
        if (!list) return null;
        return topFour(
            list.map(([name, weight]): [number, number] => {
                const index = boneIndex.get(name);
                if (index === undefined) throw new Error(`weights name unknown bone ${name}`);
                return [index, weight];
            }),
        );
    });
    const weighted = influences.flatMap((entry, i) => (entry ? [i] : []));
    let unweightedVertices = 0;
    influences.forEach((entry, i) => {
        if (entry) return;
        unweightedVertices++;
        let best = weighted[0];
        let bestDistance = Infinity;
        for (const candidate of weighted) {
            const dx = positions[candidate * 3] - positions[i * 3];
            const dy = positions[candidate * 3 + 1] - positions[i * 3 + 1];
            const dz = positions[candidate * 3 + 2] - positions[i * 3 + 2];
            const distance = dx * dx + dy * dy + dz * dz;
            if (distance < bestDistance) {
                bestDistance = distance;
                best = candidate;
            }
        }
        influences[i] = influences[best];
    });
    const joints = new Uint8Array(vertexCount * 4);
    const weights = new Float32Array(vertexCount * 4);
    influences.forEach((entry, i) => {
        (entry as [number, number][]).forEach(([bone, weight], slot) => {
            joints[i * 4 + slot] = bone;
            weights[i * 4 + slot] = weight;
        });
    });

    // Bone nodes. Local transform = the bone's world frame expressed in its parent's frame. The inverse bind matrix is
    // the inverse of the bone's world matrix in the rest pose (the mesh node sits at the origin with no transform).
    const worldByName = new Map(bones.map((bone) => [bone.name, bone]));
    const inverseBind = new Float32Array(bones.length * 16);
    const boneNodes = bones.map((bone, i) => {
        const parent = bone.parent ? (worldByName.get(bone.parent) as Bone) : null;
        const parentInverse = parent ? parent.rotation.clone().invert() : new Quaternion();
        const rotation = parentInverse.clone().multiply(bone.rotation);
        if (rotation.w < 0) rotation.set(-rotation.x, -rotation.y, -rotation.z, -rotation.w);
        const translation = parent
            ? bone.head.clone().sub(parent.head).applyQuaternion(parentInverse)
            : bone.head.clone();
        new Matrix4()
            .compose(bone.head, bone.rotation, new Vector3(1, 1, 1))
            .invert()
            .toArray(inverseBind, i * 16);
        const node: Record<string, unknown> = {
            name: bone.name,
            translation: [translation.x, translation.y, translation.z],
            rotation: [rotation.x, rotation.y, rotation.z, rotation.w],
        };
        const children = bones.flatMap((child, c) => (child.parent === bone.name ? [c + 1] : []));
        if (children.length > 0) node.children = children;
        return node;
    });

    // Binary buffer: each piece starts on a 4-byte boundary.
    const indexIsShort = vertexCount <= 65535;
    const indexBytes = indexIsShort ? Uint16Array.from(triangles) : triangles;
    const pieces: { data: ArrayBufferView; target?: number }[] = [
        { data: positions, target: ARRAY_BUFFER },
        { data: normals, target: ARRAY_BUFFER },
        { data: joints, target: ARRAY_BUFFER },
        { data: weights, target: ARRAY_BUFFER },
        { data: indexBytes, target: ELEMENT_ARRAY_BUFFER },
        { data: inverseBind },
    ];
    const bufferViews: object[] = [];
    let offset = 0;
    for (const piece of pieces) {
        bufferViews.push({
            buffer: 0,
            byteOffset: offset,
            byteLength: piece.data.byteLength,
            ...(piece.target ? { target: piece.target } : {}),
        });
        offset += align4(piece.data.byteLength);
    }
    const bin = Buffer.alloc(offset);
    offset = 0;
    for (const piece of pieces) {
        Buffer.from(piece.data.buffer, piece.data.byteOffset, piece.data.byteLength).copy(bin, offset);
        offset += align4(piece.data.byteLength);
    }

    const min = [Infinity, Infinity, Infinity];
    const max = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < vertexCount; i++) {
        for (let k = 0; k < 3; k++) {
            min[k] = Math.min(min[k], positions[i * 3 + k]);
            max[k] = Math.max(max[k], positions[i * 3 + k]);
        }
    }

    const json = {
        asset: {
            version: '2.0',
            generator: 'scripts/dancing-character-model/build-model.ts',
            copyright: 'CC0 1.0. Derived from the MakeHuman base mesh, default skeleton and default weights (CC0 1.0).',
        },
        scene: 0,
        scenes: [{ name: 'MakeHumanDancer', nodes: [0, 1] }],
        // Node 0 is the skinned mesh, node 1 the root bone and 2.. the other bones (parents before children).
        nodes: [{ name: 'Body', mesh: 0, skin: 0 }, ...boneNodes],
        meshes: [
            {
                name: 'Body',
                primitives: [
                    {
                        attributes: { POSITION: 0, NORMAL: 1, JOINTS_0: 2, WEIGHTS_0: 3 },
                        indices: 4,
                        material: 0,
                        mode: 4,
                    },
                ],
            },
        ],
        skins: [{ name: 'MakeHuman', inverseBindMatrices: 5, skeleton: 1, joints: bones.map((_, i) => i + 1) }],
        materials: [
            {
                name: 'Skin',
                pbrMetallicRoughness: {
                    baseColorFactor: [...SKIN_SRGB.map(toLinear), 1],
                    metallicFactor: 0,
                    roughnessFactor: SKIN_ROUGHNESS,
                },
            },
        ],
        accessors: [
            { bufferView: 0, componentType: FLOAT, count: vertexCount, type: 'VEC3', min, max },
            { bufferView: 1, componentType: FLOAT, count: vertexCount, type: 'VEC3' },
            { bufferView: 2, componentType: UNSIGNED_BYTE, count: vertexCount, type: 'VEC4' },
            { bufferView: 3, componentType: FLOAT, count: vertexCount, type: 'VEC4' },
            {
                bufferView: 4,
                componentType: indexIsShort ? UNSIGNED_SHORT : UNSIGNED_INT,
                count: triangles.length,
                type: 'SCALAR',
            },
            { bufferView: 5, componentType: FLOAT, count: bones.length, type: 'MAT4' },
        ],
        bufferViews,
        buffers: [{ byteLength: bin.length }],
    };

    const jsonBytes = Buffer.from(JSON.stringify(json), 'utf8');
    const jsonChunk = Buffer.alloc(align4(jsonBytes.length), 0x20);
    jsonBytes.copy(jsonChunk);
    const header = Buffer.alloc(12);
    header.write('glTF', 0, 'ascii');
    header.writeUInt32LE(2, 4);
    header.writeUInt32LE(12 + 8 + jsonChunk.length + 8 + bin.length, 8);
    const chunkHeader = (length: number, type: string): Buffer => {
        const buffer = Buffer.alloc(8);
        buffer.writeUInt32LE(length, 0);
        buffer.write(type, 4, 'ascii');
        return buffer;
    };
    const glb = Buffer.concat([
        header,
        chunkHeader(jsonChunk.length, 'JSON'),
        jsonChunk,
        chunkHeader(bin.length, 'BIN\0'),
        bin,
    ]);

    return {
        glb,
        stats: { vertices: vertexCount, triangles: triangles.length / 3, bones: bones.length, unweightedVertices },
    };
}
