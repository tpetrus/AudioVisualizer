// Parser and forward kinematics for CMU ASF (skeleton) and AMC (motion) files.
//
// Conventions (checked against the widely used acclaim readers and by looking at the result): lengths are in the ASF
// `length` unit and are converted to meters with (1 / unitLength) * 2.54 / 100; angles are degrees; the rotation of an
// `axis a b c XYZ` or of an AMC triple is Rz(c) * Ry(b) * Rx(a); a bone's world rotation is
// W = W_parent * C * M * C^-1 (C is the bone's `axis`, M the AMC rotation), so W is the identity in the rest pose and a
// bone's tail is at head + W * direction * length.

import { Euler, Quaternion, Vector3 } from 'three';

export interface AsfBone {
    name: string;
    parent: string | null;
    // Rest direction in world space (unit vector) and length in meters.
    direction: Vector3;
    length: number;
    // C and its inverse, from the `axis` line.
    axis: Quaternion;
    axisInverse: Quaternion;
    // The rotation channels the AMC file lists for this bone, in order ('rx', 'ry', 'rz').
    dof: string[];
}

export interface AsfSkeleton {
    // Parent before child, root first.
    bones: AsfBone[];
    index: Map<string, number>;
    // Meters per ASF length unit.
    unit: number;
}

const toEuler = (a: number, b: number, c: number): Quaternion =>
    new Quaternion().setFromEuler(new Euler((a * Math.PI) / 180, (b * Math.PI) / 180, (c * Math.PI) / 180, 'ZYX'));

export function parseAsf(text: string): AsfSkeleton {
    const lines = text.split(/\r?\n/).map((l) => l.trim());
    let lengthUnit = 1;
    let section = '';
    const raw: {
        name: string;
        direction: Vector3;
        length: number;
        axis: [number, number, number];
        dof: string[];
    }[] = [];
    let current: (typeof raw)[number] | null = null;
    const children = new Map<string, string[]>();
    for (const line of lines) {
        if (line === '' || line.startsWith('#')) continue;
        if (line.startsWith(':')) {
            section = line.slice(1).split(/\s+/)[0];
            continue;
        }
        const parts = line.split(/\s+/);
        if (section === 'units') {
            if (parts[0] === 'length') lengthUnit = Number(parts[1]);
            if (parts[0] === 'angle' && parts[1] !== 'deg') throw new Error('ASF angle unit is not degrees');
        } else if (section === 'bonedata') {
            if (parts[0] === 'begin') {
                current = { name: '', direction: new Vector3(), length: 0, axis: [0, 0, 0], dof: [] };
                raw.push(current);
            } else if (current) {
                if (parts[0] === 'name') current.name = parts[1];
                else if (parts[0] === 'direction') current.direction.set(+parts[1], +parts[2], +parts[3]).normalize();
                else if (parts[0] === 'length') current.length = Number(parts[1]);
                else if (parts[0] === 'axis') {
                    if (parts[4] !== 'XYZ') throw new Error(`unsupported axis order ${parts[4]}`);
                    current.axis = [+parts[1], +parts[2], +parts[3]];
                } else if (parts[0] === 'dof') current.dof = parts.slice(1);
            }
        } else if (section === 'hierarchy') {
            if (parts[0] === 'begin' || parts[0] === 'end') continue;
            children.set(parts[0], parts.slice(1));
        }
    }
    const unit = (1 / lengthUnit) * 0.0254;
    const parentOf = new Map<string, string>();
    for (const [parent, kids] of children) for (const kid of kids) parentOf.set(kid, parent);
    const bones: AsfBone[] = [
        {
            name: 'root',
            parent: null,
            direction: new Vector3(0, 1, 0),
            length: 0,
            axis: new Quaternion(),
            axisInverse: new Quaternion(),
            dof: ['rx', 'ry', 'rz'],
        },
    ];
    const byName = new Map(raw.map((r) => [r.name, r]));
    const queue = ['root'];
    while (queue.length) {
        const name = queue.shift() as string;
        for (const kid of children.get(name) ?? []) {
            const r = byName.get(kid);
            if (!r) throw new Error(`bone ${kid} has no bonedata`);
            const axis = toEuler(...r.axis);
            bones.push({
                name: kid,
                parent: name,
                direction: r.direction,
                length: r.length * unit,
                axis,
                axisInverse: axis.clone().invert(),
                dof: r.dof,
            });
            queue.push(kid);
        }
    }
    return { bones, index: new Map(bones.map((b, i) => [b.name, i])), unit };
}

export interface AmcMotion {
    // frames[f][bone] holds the raw values of that bone, in the ASF dof order (root: TX TY TZ RX RY RZ).
    frames: Map<string, number[]>[];
}

export function parseAmc(text: string): AmcMotion {
    const frames: Map<string, number[]>[] = [];
    let frame: Map<string, number[]> | null = null;
    for (const raw of text.split(/\r?\n/)) {
        const line = raw.trim();
        if (line === '' || line.startsWith('#') || line.startsWith(':')) continue;
        const parts = line.split(/\s+/);
        if (parts.length === 1 && /^\d+$/.test(parts[0])) {
            frame = new Map();
            frames.push(frame);
        } else if (frame) {
            frame.set(parts[0], parts.slice(1).map(Number));
        }
    }
    return { frames };
}

// One posed frame: the world rotation of every bone, the world position of every bone's end (tail), and the root's
// position. All in meters, in the capture's own world frame (Y up).
export interface SourcePose {
    rotation: Quaternion[];
    tail: Vector3[];
    rootPosition: Vector3;
}

export function createSourcePose(skeleton: AsfSkeleton): SourcePose {
    return {
        rotation: skeleton.bones.map(() => new Quaternion()),
        tail: skeleton.bones.map(() => new Vector3()),
        rootPosition: new Vector3(),
    };
}

const motionQuaternion = new Quaternion();
const step = new Vector3();

export function poseSource(skeleton: AsfSkeleton, frame: Map<string, number[]> | null, out: SourcePose): void {
    const { bones, index, unit } = skeleton;
    for (let i = 0; i < bones.length; i++) {
        const bone = bones[i];
        const values = frame?.get(bone.name);
        const angles: Record<string, number> = { rx: 0, ry: 0, rz: 0 };
        if (values) {
            if (i === 0) {
                out.rootPosition.set(values[0] * unit, values[1] * unit, values[2] * unit);
                angles.rx = values[3];
                angles.ry = values[4];
                angles.rz = values[5];
            } else {
                bone.dof.forEach((channel, k) => {
                    if (channel in angles) angles[channel] = values[k];
                });
            }
        } else if (i === 0) out.rootPosition.set(0, 0, 0);
        motionQuaternion.copy(toEuler(angles.rx, angles.ry, angles.rz));
        const world = out.rotation[i];
        if (i === 0) {
            world.copy(bone.axis).multiply(motionQuaternion).multiply(bone.axisInverse);
            out.tail[0].copy(out.rootPosition);
        } else {
            const p = index.get(bone.parent as string) as number;
            world.copy(out.rotation[p]).multiply(bone.axis).multiply(motionQuaternion).multiply(bone.axisInverse);
            step.copy(bone.direction).multiplyScalar(bone.length).applyQuaternion(world);
            out.tail[i].copy(out.tail[p]).add(step);
        }
    }
}
