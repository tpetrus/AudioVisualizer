// Turns the parsed MakeHuman data into a binary glTF (GLB): the skinned body, the skinned garments (each its own mesh
// and material, textured), and one skin over every bone shared by all of them. The container is written by hand
// (JSON chunk + BIN chunk, both 4-byte aligned) because three's GLTFExporter needs FileReader, which Node lacks.

import { Matrix4, Quaternion, Vector3 } from 'three';
import { HAIR_ALPHA_CUTOFF } from './outfit';
import type { Garment } from './outfit';
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
const LINEAR = 9729;
const LINEAR_MIPMAP_LINEAR = 9987;
const REPEAT = 10497;

export interface PartStats {
    name: string;
    vertices: number;
    triangles: number;
}

export interface ModelStats {
    vertices: number;
    triangles: number;
    bones: number;
    // Vertices that had no weight in the source and copied the nearest weighted vertex.
    unweightedVertices: number;
    // Body faces a garment hides (any corner in a garment's delete_verts).
    deletedBodyFaces: number;
    // Body first, then the garments in order.
    parts: PartStats[];
}

// One mesh of the model, ready to be written.
interface Part {
    name: string;
    positions: Float32Array;
    normals: Float32Array;
    uvs: Float32Array | null;
    joints: Uint8Array;
    weights: Float32Array;
    indices: Uint32Array;
    garment: Garment | null;
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

// Smooth normals: the sum of the (area-weighted) face normals around each vertex.
function smoothNormals(positions: Float32Array, triangles: ArrayLike<number>): Float32Array {
    const count = positions.length / 3;
    const normals = new Float32Array(count * 3);
    const accumulated = new Float64Array(count * 3);
    const a = new Vector3();
    const b = new Vector3();
    const c = new Vector3();
    const face = new Vector3();
    const at = (target: Vector3, i: number): Vector3 =>
        target.set(positions[i * 3], positions[i * 3 + 1], positions[i * 3 + 2]);
    for (let t = 0; t < triangles.length; t += 3) {
        at(a, triangles[t]);
        face.crossVectors(at(b, triangles[t + 1]).sub(a), at(c, triangles[t + 2]).sub(a));
        for (let k = 0; k < 3; k++) {
            accumulated[triangles[t + k] * 3] += face.x;
            accumulated[triangles[t + k] * 3 + 1] += face.y;
            accumulated[triangles[t + k] * 3 + 2] += face.z;
        }
    }
    for (let i = 0; i < count; i++) {
        const n = new Vector3(accumulated[i * 3], accumulated[i * 3 + 1], accumulated[i * 3 + 2]).normalize();
        normals.set([n.x, n.y, n.z], i * 3);
    }
    return normals;
}

function packInfluences(influences: [number, number][][]): { joints: Uint8Array; weights: Float32Array } {
    const joints = new Uint8Array(influences.length * 4);
    const weights = new Float32Array(influences.length * 4);
    influences.forEach((entry, i) => {
        entry.forEach(([bone, weight], slot) => {
            joints[i * 4 + slot] = bone;
            weights[i * 4 + slot] = weight;
        });
    });
    return { joints, weights };
}

function bounds(positions: Float32Array): { min: number[]; max: number[] } {
    const min = [Infinity, Infinity, Infinity];
    const max = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < positions.length; i += 3) {
        for (let k = 0; k < 3; k++) {
            min[k] = Math.min(min[k], positions[i + k]);
            max[k] = Math.max(max[k], positions[i + k]);
        }
    }
    return { min, max };
}

export function buildGlb(
    mesh: BaseMesh,
    bones: Bone[],
    sourceWeights: Map<number, [string, number][]>,
    garments: Garment[] = [],
): { glb: Buffer; stats: ModelStats } {
    const boneIndex = new Map(bones.map((bone, i) => [bone.name, i]));
    const bone = (name: string): number => {
        const index = boneIndex.get(name);
        if (index === undefined) throw new Error(`weights name unknown bone ${name}`);
        return index;
    };

    // Triangulate the body faces (quads split along the first diagonal) after dropping every face a garment hides.
    const deleted = new Set<number>();
    for (const garment of garments) for (const index of garment.deleteVerts) deleted.add(index);
    const keptFaces = mesh.bodyFaces.filter((face) => !face.some((index) => deleted.has(index)));
    const deletedBodyFaces = mesh.bodyFaces.length - keptFaces.length;
    const fan = (faces: number[][]): number[] =>
        faces.flatMap((face) => {
            const out: number[] = [];
            for (let i = 1; i + 1 < face.length; i++) out.push(face[0], face[i], face[i + 1]);
            return out;
        });
    const bodyTriangles = fan(keptFaces);

    // glTF front faces are counter-clockwise. Check the winding of the whole body by its signed volume and flip every
    // mesh (garments share MakeHuman's winding) if it is inside out.
    let volume = 0;
    const base = (i: number): Vector3 =>
        new Vector3(mesh.vertices[i * 3], mesh.vertices[i * 3 + 1], mesh.vertices[i * 3 + 2]);
    const allTriangles = fan(mesh.bodyFaces);
    for (let t = 0; t < allTriangles.length; t += 3) {
        volume += base(allTriangles[t]).dot(
            new Vector3().crossVectors(base(allTriangles[t + 1]), base(allTriangles[t + 2])),
        );
    }
    const flip = volume < 0;
    const flipTriangles = (triangles: Uint32Array): void => {
        if (!flip) return;
        for (let t = 0; t < triangles.length; t += 3) {
            const swap = triangles[t + 1];
            triangles[t + 1] = triangles[t + 2];
            triangles[t + 2] = swap;
        }
    };

    // ---- Body: reindex to the vertices the remaining triangles use, in ascending order of their original index.
    const used = [...new Set(bodyTriangles)].sort((a, b) => a - b);
    const remap = new Map(used.map((original, i) => [original, i]));
    const bodyCount = used.length;
    const bodyPositions = new Float32Array(bodyCount * 3);
    used.forEach((original, i) => {
        for (let k = 0; k < 3; k++) bodyPositions[i * 3 + k] = mesh.vertices[original * 3 + k] * UNIT_SCALE;
    });
    const bodyIndices = Uint32Array.from(bodyTriangles.map((original) => remap.get(original) as number));
    flipTriangles(bodyIndices);

    // Skinning: top four influences per vertex. A vertex without any weight copies the influences of the nearest
    // weighted vertex (squared distance, lowest index wins ties), so it moves with the body part it sits on.
    const bodyInfluences: ([number, number][] | null)[] = used.map((original) => {
        const list = sourceWeights.get(original);
        if (!list) return null;
        return topFour(list.map(([name, weight]): [number, number] => [bone(name), weight]));
    });
    const weighted = bodyInfluences.flatMap((entry, i) => (entry ? [i] : []));
    let unweightedVertices = 0;
    bodyInfluences.forEach((entry, i) => {
        if (entry) return;
        unweightedVertices++;
        let best = weighted[0];
        let bestDistance = Infinity;
        for (const candidate of weighted) {
            const dx = bodyPositions[candidate * 3] - bodyPositions[i * 3];
            const dy = bodyPositions[candidate * 3 + 1] - bodyPositions[i * 3 + 1];
            const dz = bodyPositions[candidate * 3 + 2] - bodyPositions[i * 3 + 2];
            const distance = dx * dx + dy * dy + dz * dz;
            if (distance < bestDistance) {
                bestDistance = distance;
                best = candidate;
            }
        }
        bodyInfluences[i] = bodyInfluences[best];
    });
    const parts: Part[] = [
        {
            name: 'Body',
            positions: bodyPositions,
            normals: smoothNormals(bodyPositions, bodyIndices),
            uvs: null,
            ...packInfluences(bodyInfluences as [number, number][][]),
            indices: bodyIndices,
            garment: null,
        },
    ];

    // ---- Garments. Positions and normals are per proxy vertex; a vertex that has different UVs on different faces is
    // split into one output vertex per (vertex, uv) pair, in order of first use.
    for (const garment of garments) {
        const proxyCount = garment.positions.length / 3;
        const proxyPositions = Float32Array.from(garment.positions, (value) => value * UNIT_SCALE);
        const corners = garment.corners.map((corner) => [...corner] as [number, number]);
        if (flip) {
            for (let t = 0; t < corners.length; t += 3)
                [corners[t + 1], corners[t + 2]] = [corners[t + 2], corners[t + 1]];
        }
        const proxyNormals = smoothNormals(
            proxyPositions,
            corners.map(([v]) => v),
        );
        const proxyInfluences = garment.influences.map((list) =>
            topFour(list.map(([name, weight]): [number, number] => [bone(name), weight])),
        );
        const proxyPacked = packInfluences(proxyInfluences);

        const split = new Map<string, number>();
        const sources: [number, number][] = [];
        const indices = new Uint32Array(corners.length);
        corners.forEach(([v, vt], i) => {
            if (v >= proxyCount || vt * 2 + 1 >= garment.uvs.length)
                throw new Error(`${garment.name}: bad face corner`);
            const key = `${v}/${vt}`;
            let index = split.get(key);
            if (index === undefined) {
                index = sources.length;
                split.set(key, index);
                sources.push([v, vt]);
            }
            indices[i] = index;
        });
        const count = sources.length;
        const positions = new Float32Array(count * 3);
        const normals = new Float32Array(count * 3);
        const uvs = new Float32Array(count * 2);
        const joints = new Uint8Array(count * 4);
        const weights = new Float32Array(count * 4);
        sources.forEach(([v, vt], i) => {
            positions.set(proxyPositions.subarray(v * 3, v * 3 + 3), i * 3);
            normals.set(proxyNormals.subarray(v * 3, v * 3 + 3), i * 3);
            uvs.set([garment.uvs[vt * 2], garment.uvs[vt * 2 + 1]], i * 2);
            joints.set(proxyPacked.joints.subarray(v * 4, v * 4 + 4), i * 4);
            weights.set(proxyPacked.weights.subarray(v * 4, v * 4 + 4), i * 4);
        });
        parts.push({ name: garment.name, positions, normals, uvs, joints, weights, indices, garment });
    }

    // ---- Binary buffer: each piece starts on a 4-byte boundary (and unused padding bytes are zero).
    const chunks: Buffer[] = [];
    const bufferViews: object[] = [];
    const accessors: object[] = [];
    let binLength = 0;
    const addView = (data: ArrayBufferView, target?: number): number => {
        bufferViews.push({
            buffer: 0,
            byteOffset: binLength,
            byteLength: data.byteLength,
            ...(target ? { target } : {}),
        });
        const chunk = Buffer.alloc(align4(data.byteLength));
        Buffer.from(data.buffer, data.byteOffset, data.byteLength).copy(chunk);
        chunks.push(chunk);
        binLength += chunk.length;
        return bufferViews.length - 1;
    };
    const addAccessor = (
        data: ArrayBufferView,
        componentType: number,
        type: string,
        count: number,
        target?: number,
        extra: object = {},
    ): number => {
        accessors.push({ bufferView: addView(data, target), componentType, count, type, ...extra });
        return accessors.length - 1;
    };

    // Bone nodes. Local transform = the bone's world frame expressed in its parent's frame. The inverse bind matrix is
    // the inverse of the bone's world matrix in the rest pose (the mesh nodes sit at the origin with no transform).
    // Nodes 0..parts-1 are the meshes, then the bones (parents before children).
    const firstBone = parts.length;
    const worldByName = new Map(bones.map((b) => [b.name, b]));
    const inverseBind = new Float32Array(bones.length * 16);
    const boneNodes = bones.map((b, i) => {
        const parent = b.parent ? (worldByName.get(b.parent) as Bone) : null;
        const parentInverse = parent ? parent.rotation.clone().invert() : new Quaternion();
        const rotation = parentInverse.clone().multiply(b.rotation);
        if (rotation.w < 0) rotation.set(-rotation.x, -rotation.y, -rotation.z, -rotation.w);
        const translation = parent ? b.head.clone().sub(parent.head).applyQuaternion(parentInverse) : b.head.clone();
        new Matrix4()
            .compose(b.head, b.rotation, new Vector3(1, 1, 1))
            .invert()
            .toArray(inverseBind, i * 16);
        const node: Record<string, unknown> = {
            name: b.name,
            translation: [translation.x, translation.y, translation.z],
            rotation: [rotation.x, rotation.y, rotation.z, rotation.w],
        };
        const children = bones.flatMap((child, c) => (child.parent === b.name ? [c + firstBone] : []));
        if (children.length > 0) node.children = children;
        return node;
    });

    const materials: object[] = [
        {
            name: 'Skin',
            pbrMetallicRoughness: {
                baseColorFactor: [...SKIN_SRGB.map(toLinear), 1],
                metallicFactor: 0,
                roughnessFactor: SKIN_ROUGHNESS,
            },
        },
    ];
    const images: object[] = [];
    const textures: object[] = [];
    const meshes: object[] = [];
    for (const part of parts) {
        const attributes: Record<string, number> = {
            POSITION: addAccessor(
                part.positions,
                FLOAT,
                'VEC3',
                part.positions.length / 3,
                ARRAY_BUFFER,
                bounds(part.positions),
            ),
            NORMAL: addAccessor(part.normals, FLOAT, 'VEC3', part.normals.length / 3, ARRAY_BUFFER),
        };
        if (part.uvs) attributes.TEXCOORD_0 = addAccessor(part.uvs, FLOAT, 'VEC2', part.uvs.length / 2, ARRAY_BUFFER);
        attributes.JOINTS_0 = addAccessor(part.joints, UNSIGNED_BYTE, 'VEC4', part.joints.length / 4, ARRAY_BUFFER);
        attributes.WEIGHTS_0 = addAccessor(part.weights, FLOAT, 'VEC4', part.weights.length / 4, ARRAY_BUFFER);
        const short = part.positions.length / 3 <= 65535;
        const indices = addAccessor(
            short ? Uint16Array.from(part.indices) : part.indices,
            short ? UNSIGNED_SHORT : UNSIGNED_INT,
            'SCALAR',
            part.indices.length,
            ELEMENT_ARRAY_BUFFER,
        );

        let material = 0;
        if (part.garment) {
            const g = part.garment;
            images.push({ name: g.materialName, bufferView: addView(g.texture.data), mimeType: g.texture.mimeType });
            textures.push({ sampler: 0, source: images.length - 1 });
            materials.push({
                name: g.materialName,
                pbrMetallicRoughness: {
                    baseColorTexture: { index: textures.length - 1 },
                    metallicFactor: 0,
                    roughnessFactor: g.roughness,
                },
                ...(g.cutout ? { alphaMode: 'MASK', alphaCutoff: HAIR_ALPHA_CUTOFF, doubleSided: true } : {}),
            });
            material = materials.length - 1;
        }
        meshes.push({ name: part.name, primitives: [{ attributes, indices, material, mode: 4 }] });
    }
    const inverseBindAccessor = addAccessor(inverseBind, FLOAT, 'MAT4', bones.length);
    const bin = Buffer.concat(chunks);

    const json = {
        asset: {
            version: '2.0',
            generator: 'scripts/dancing-character-model/build-model.ts',
            copyright:
                'CC0 1.0. Derived from the MakeHuman base mesh, default skeleton and default weights, and the MakeHuman ' +
                'system assets male_casualsuit06, shoes06, short02 and low-poly eyes (all CC0 1.0).',
        },
        scene: 0,
        scenes: [{ name: 'MakeHumanDancer', nodes: [...parts.map((_, i) => i), firstBone] }],
        // Nodes 0..parts-1 are the skinned meshes, then the root bone and the other bones (parents before children).
        nodes: [...parts.map((part, i) => ({ name: part.name, mesh: i, skin: 0 })), ...boneNodes],
        meshes,
        skins: [
            {
                name: 'MakeHuman',
                inverseBindMatrices: inverseBindAccessor,
                skeleton: firstBone,
                joints: bones.map((_, i) => i + firstBone),
            },
        ],
        materials,
        ...(textures.length > 0
            ? {
                  samplers: [{ magFilter: LINEAR, minFilter: LINEAR_MIPMAP_LINEAR, wrapS: REPEAT, wrapT: REPEAT }],
                  images,
                  textures,
              }
            : {}),
        accessors,
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

    const partStats = parts.map((part) => ({
        name: part.name,
        vertices: part.positions.length / 3,
        triangles: part.indices.length / 3,
    }));
    return {
        glb,
        stats: {
            vertices: partStats.reduce((sum, part) => sum + part.vertices, 0),
            triangles: partStats.reduce((sum, part) => sum + part.triangles, 0),
            bones: bones.length,
            unweightedVertices,
            deletedBodyFaces,
            parts: partStats,
        },
    };
}
