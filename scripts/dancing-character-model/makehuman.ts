// Reads the MakeHuman CC0 source files (base mesh, default skeleton, default weights) into plain data. Everything here
// is parsing and geometry on the raw MakeHuman data; the glTF writing lives in glb.ts.

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Matrix4, Quaternion, Vector3 } from 'three';

// The exact upstream files this generator was written against (makehumancommunity/makehuman at SOURCE_COMMIT, under
// makehuman/data/). Refusing any other bytes keeps the output reproducible and the license record accurate.
export const SOURCE_COMMIT = 'a8bc2d54ff0ac92e78ff71431b1023eda42bf482';
export const INPUTS = {
    obj: { file: 'base.obj', sha256: '8e761e6624b8f54536409135d1636da63b32486a90d4897f84e121d144f6fb4c' },
    skeleton: { file: 'default.mhskel', sha256: '99f179bce0aa850b45d4191a1d0d234c5851f881c057439470ded3bddf729a24' },
    weights: {
        file: 'default_weights.mhw',
        sha256: '0f3641d651ae3d00ad6b4ccee43142edb109d3bd909d27d9e4139ef1beed8625',
    },
    material: { file: 'default.mhmat', sha256: '3df4dece5e9293f36a02a2e1fdb6d0f6f33d31584abc9219937b1cbbd8d9a377' },
} as const;

// MakeHuman units are decimeters; glTF is meters.
export const UNIT_SCALE = 0.1;

export interface BaseMesh {
    // Every vertex of base.obj (body and helper geometry), in MakeHuman units, as x, y, z triples.
    vertices: Float64Array;
    // Triangles (three vertex indices each, into `vertices`) of the `body` group only.
    bodyTriangles: number[];
}

export interface Bone {
    name: string;
    parent: string | null;
    head: Vector3;
    tail: Vector3;
    // World rotation of the bone's rest frame (local +Y runs head to tail).
    rotation: Quaternion;
}

interface SkeletonFile {
    bones: Record<string, { head: string; tail: string; parent: string | null; rotation_plane: string | null }>;
    joints: Record<string, number[]>;
    planes: Record<string, [string, string, string]>;
}

export function readInput(dir: string, input: { file: string; sha256: string }): string {
    const bytes = readFileSync(join(dir, input.file));
    const actual = createHash('sha256').update(bytes).digest('hex');
    if (actual !== input.sha256) {
        throw new Error(`${input.file}: sha256 ${actual} does not match the expected ${input.sha256}`);
    }
    return bytes.toString('utf8');
}

export function parseObj(text: string): BaseMesh {
    const positions: number[] = [];
    const bodyTriangles: number[] = [];
    let group = '';
    for (const line of text.split('\n')) {
        const parts = line.trim().split(/\s+/);
        if (parts[0] === 'v') {
            positions.push(Number(parts[1]), Number(parts[2]), Number(parts[3]));
        } else if (parts[0] === 'g') {
            group = parts[1] ?? '';
        } else if (parts[0] === 'f' && group === 'body') {
            // "v/vt" corners, 1-based. Quads are split along the first diagonal.
            const corners = parts.slice(1).map((corner) => Number(corner.split('/')[0]) - 1);
            for (let i = 1; i + 1 < corners.length; i++) {
                bodyTriangles.push(corners[0], corners[i], corners[i + 1]);
            }
        }
    }
    return { vertices: Float64Array.from(positions), bodyTriangles };
}

// The joint position is the centroid of the listed base.obj vertices, taken over the full vertex array (the joint
// vertices belong to dropped helper groups), then scaled to meters.
function jointPositions(skeleton: SkeletonFile, vertices: Float64Array): Map<string, Vector3> {
    const joints = new Map<string, Vector3>();
    for (const [name, indices] of Object.entries(skeleton.joints)) {
        const sum = new Vector3();
        for (const index of indices) {
            sum.x += vertices[index * 3];
            sum.y += vertices[index * 3 + 1];
            sum.z += vertices[index * 3 + 2];
        }
        joints.set(name, sum.multiplyScalar(UNIT_SCALE / indices.length));
    }
    return joints;
}

// Rest orientation, following MakeHuman's own export and Blender's bone convention:
//   Y = normalize(tail - head)
//   N = normalize(cross(p2 - p1, p3 - p2)) for the bone's rotation plane (joints p1, p2, p3)
//   X = normalize(cross(Y, N)), Z = cross(X, Y)
// so (X, Y, Z) is a right-handed, orthonormal frame with Y along the bone and Z on the plane normal. A missing,
// zero or Y-parallel normal falls back to the world +Z axis (then +X), and a zero-length bone to its parent's Y.
function restFrame(y: Vector3, normal: Vector3 | null): Matrix4 {
    const fallbacks = [new Vector3(0, 0, 1), new Vector3(1, 0, 0)];
    const candidates = normal ? [normal, ...fallbacks] : fallbacks;
    for (const candidate of candidates) {
        const x = new Vector3().crossVectors(y, candidate);
        if (x.lengthSq() < 1e-12) continue;
        x.normalize();
        const z = new Vector3().crossVectors(x, y);
        return new Matrix4().makeBasis(x, y, z);
    }
    throw new Error('no usable roll axis');
}

export function parseSkeleton(text: string, vertices: Float64Array): Bone[] {
    const skeleton = JSON.parse(text) as SkeletonFile;
    const joints = jointPositions(skeleton, vertices);
    const joint = (name: string): Vector3 => {
        const found = joints.get(name);
        if (!found) throw new Error(`unknown joint ${name}`);
        return found;
    };

    const names = Object.keys(skeleton.bones);
    const byName = new Map<string, Bone>();
    const yAxes = new Map<string, Vector3>();
    // Parents first, children in file order, so node indices and joint indices are stable and a parent's frame is known
    // before its children (needed for the zero-length-bone fallback).
    const ordered: string[] = [];
    const visit = (name: string): void => {
        ordered.push(name);
        for (const child of names) if (skeleton.bones[child].parent === name) visit(child);
    };
    const roots = names.filter((name) => skeleton.bones[name].parent === null);
    if (roots.length !== 1 || roots[0] !== 'root')
        throw new Error(`expected the single root "root", got ${roots.join(', ')}`);
    visit('root');
    if (ordered.length !== names.length) throw new Error('skeleton is not a single tree');

    for (const name of ordered) {
        const def = skeleton.bones[name];
        const head = joint(def.head).clone();
        const tail = joint(def.tail).clone();
        const y = tail.clone().sub(head);
        if (y.lengthSq() < 1e-12) y.copy((def.parent && yAxes.get(def.parent)) || new Vector3(0, 1, 0));
        y.normalize();
        yAxes.set(name, y);

        let normal: Vector3 | null = null;
        if (def.rotation_plane) {
            const plane = skeleton.planes[def.rotation_plane];
            const [p1, p2, p3] = plane.map(joint);
            normal = new Vector3().crossVectors(p2.clone().sub(p1), p3.clone().sub(p2));
            normal = normal.lengthSq() < 1e-12 ? null : normal.normalize();
        }
        const rotation = new Quaternion().setFromRotationMatrix(restFrame(y, normal)).normalize();
        byName.set(name, { name, parent: def.parent, head, tail, rotation });
    }
    return ordered.map((name) => byName.get(name) as Bone);
}

// Per vertex of base.obj, a list of [boneName, weight] influences.
export function parseWeights(text: string, vertexCount: number): Map<number, [string, number][]> {
    const file = JSON.parse(text) as { weights: Record<string, [number, number][]> };
    const result = new Map<number, [string, number][]>();
    for (const [bone, entries] of Object.entries(file.weights)) {
        for (const [index, weight] of entries) {
            if (index < 0 || index >= vertexCount) throw new Error(`weight for ${bone} names vertex ${index}`);
            const list = result.get(index) ?? [];
            list.push([bone, weight]);
            result.set(index, list);
        }
    }
    return result;
}
