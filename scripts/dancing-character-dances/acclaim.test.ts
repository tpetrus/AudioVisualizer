import { describe, expect, it } from 'vitest';
import { createSourcePose, parseAmc, parseAsf, poseSource } from './acclaim';

// A two-bone skeleton and a two-frame motion: the smallest input the parsers have to read.
const ASF = `# comment
:version 1.10
:units
  mass 1.0
  length 0.5
  angle deg
:root
  order TX TY TZ RX RY RZ
  axis XYZ
:bonedata
  begin
    id 1
    name spine
    direction 0 1 0
    length 2
    axis 0 0 0 XYZ
    dof rx ry rz
  end
  begin
    id 2
    name arm
    direction 1 0 0
    length 4
    axis 0 0 90 XYZ
    dof rz
  end
:hierarchy
  begin
    root spine
    spine arm
  end
`;

const AMC = `#!OML:ASF test.asf
:FULLY-SPECIFIED
:DEGREES
1
root 0 0 0 0 0 0
spine 0 0 0
arm 0
2
root 1 2 3 0 0 0
spine 0 0 90
arm 45
`;

describe('parseAsf', () => {
    it('reads bones parent first with unit-converted lengths and normalized directions', () => {
        const skeleton = parseAsf(ASF);
        expect(skeleton.bones.map((b) => b.name)).toEqual(['root', 'spine', 'arm']);
        expect(skeleton.bones[2].parent).toBe('spine');
        expect(skeleton.unit).toBeCloseTo((1 / 0.5) * 0.0254, 12);
        expect(skeleton.bones[1].length).toBeCloseTo(2 * skeleton.unit, 12);
        expect(skeleton.bones[2].direction.toArray()).toEqual([1, 0, 0]);
        expect(skeleton.bones[2].dof).toEqual(['rz']);
        expect(skeleton.index.get('arm')).toBe(2);
    });

    it('rejects an axis order other than XYZ and non-degree angles', () => {
        expect(() => parseAsf(ASF.replace('axis 0 0 90 XYZ', 'axis 0 0 90 ZYX'))).toThrow(/axis order/);
        expect(() => parseAsf(ASF.replace('angle deg', 'angle rad'))).toThrow(/degrees/);
    });
});

describe('parseAmc', () => {
    it('reads one map of raw values per frame', () => {
        const { frames } = parseAmc(AMC);
        expect(frames).toHaveLength(2);
        expect(frames[1].get('root')).toEqual([1, 2, 3, 0, 0, 0]);
        expect(frames[1].get('arm')).toEqual([45]);
    });

    it('poses the skeleton: a rotation moves the bone tail and the root position is in meters', () => {
        const skeleton = parseAsf(ASF);
        const { frames } = parseAmc(AMC);
        const pose = createSourcePose(skeleton);
        poseSource(skeleton, frames[0], pose);
        const spine = skeleton.index.get('spine') as number;
        const restTail = pose.tail[spine].clone();
        expect(restTail.length()).toBeCloseTo(skeleton.bones[spine].length, 9);
        poseSource(skeleton, frames[1], pose);
        expect(pose.rootPosition.x).toBeCloseTo(1 * skeleton.unit, 9);
        expect(pose.tail[spine].clone().sub(pose.rootPosition).length()).toBeCloseTo(restTail.length(), 9);
        expect(pose.tail[spine].distanceTo(restTail)).toBeGreaterThan(0.01);
    });
});
