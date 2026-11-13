import * as THREE from 'three';
import type { BufferAttribute, Material } from 'three';
import { describe, expect, it, vi } from 'vitest';
import { bassInkSceneConfig } from './bassInkSceneConfig';
import { KICK_SLOTS, type DirectorCue, type PalettePair } from './bassInkTypes';
import { writeFormation } from './formations';
import { InkCloud } from './inkCloud';
import { KickRing } from './kickRing';

const POINTS = 50000;
const SEED = 7;
const CHUNK = bassInkSceneConfig.points.fillChunkPoints;
const FILL_UPDATES = Math.ceil(POINTS / CHUNK);

function makeCue(): DirectorCue {
    return {
        phase: 'groove',
        tension: 0,
        dropAt: -1,
        formationIndex: 0,
        nextFormationIndex: 1,
        paletteIndex: 0,
        transitionStart: -1,
        transitionSeconds: 2,
        transitionCount: 0,
    };
}

const palette: PalettePair = { core: new Float32Array([1, 0.5, 0.25]), edge: new Float32Array([0.1, 0.2, 0.3]) };

function setup() {
    const cloud = new InkCloud(POINTS, SEED, 64);
    const cue = makeCue();
    const kicks = new KickRing();
    let time = 0;
    // One frame at the given scene time (default: the same time again).
    const frame = (at = time) => {
        time = at;
        cloud.update(cue, 0.25, kicks, palette, 0.1, at);
    };
    const attributes = () => cloud.object.geometry.attributes as Record<string, BufferAttribute>;
    const positions = (side: 'position' | 'restB') => attributes()[side].array as Float32Array;
    const formation = (index: number) => {
        const out = new Float32Array(POINTS * 3);
        writeFormation(index, SEED, out, POINTS, 0, POINTS);
        return out;
    };
    const rest = (point: number) => {
        const out = [0, 0, 0];
        cloud.restPosition(point, out);
        return out;
    };
    return { cloud, cue, kicks, frame, attributes, positions, formation, rest };
}

const uniformOf = (cloud: InkCloud, name: string) =>
    (cloud.object.material as unknown as { uniforms: Record<string, { value: unknown }> }).uniforms[name].value;

describe('InkCloud', () => {
    it('starts on formation 0 on side A, with nothing prepared and no fade', () => {
        const { cloud, positions, formation } = setup();

        expect(cloud.activeIndex).toBe(0);
        expect(cloud.preparedIndex).toBe(-1);
        expect(cloud.filling).toBe(false);
        expect(cloud.transitioning).toBe(false);
        expect(positions('position')).toEqual(formation(0));
        expect(cloud.object.frustumCulled).toBe(false);
        expect(cloud.pointCount).toBe(POINTS);
    });

    describe('chunked fill', () => {
        it('completes after ceil(points / chunk) updates and equals what writeFormation gives', () => {
            const { cloud, frame, positions, formation } = setup();

            cloud.prepareFormation(2, SEED);
            expect(cloud.filling).toBe(true);
            // Preparing writes nothing by itself: the work is spread over the next updates.
            expect(positions('restB').every((v) => v === 0)).toBe(true);

            for (let i = 1; i < FILL_UPDATES; i++) {
                frame();
                expect(cloud.filling).toBe(true);
            }
            frame();

            expect(cloud.filling).toBe(false);
            expect(cloud.preparedIndex).toBe(2);
            expect(positions('restB')).toEqual(formation(2));
        });

        it('marks only the written range for upload', () => {
            const { cloud, frame, attributes } = setup();
            const attribute = attributes().restB;
            const version = attribute.version;

            cloud.prepareFormation(1, SEED);
            frame();

            expect(attribute.version).toBe(version + 1);
            expect(attribute.updateRanges).toEqual([{ start: 0, count: CHUNK * 3 }]);
            frame();
            expect(attribute.updateRanges[1]).toEqual({ start: CHUNK * 3, count: CHUNK * 3 });
        });

        it('asking again for what is prepared or being filled changes nothing', () => {
            const { cloud, frame } = setup();
            cloud.prepareFormation(1, SEED);
            frame();

            cloud.prepareFormation(1, SEED);
            frame();
            frame();

            expect(cloud.filling).toBe(false);
            expect(cloud.preparedIndex).toBe(1);
        });

        it('restarts the fill for a different formation', () => {
            const { cloud, frame, positions, formation } = setup();
            cloud.prepareFormation(1, SEED);
            frame();

            cloud.prepareFormation(3, SEED);
            for (let i = 0; i < FILL_UPDATES; i++) frame();

            expect(positions('restB')).toEqual(formation(3));
        });
    });

    describe('transitions', () => {
        it('fades to the prepared formation by a uniform and swaps the active side at the end', () => {
            const { cloud, frame, attributes, formation, rest } = setup();
            const sideA = attributes().position;
            const sideB = attributes().restB;
            cloud.prepareFormation(1, SEED);
            for (let i = 0; i < FILL_UPDATES; i++) frame(0);

            cloud.beginTransition(10, 2);
            expect(cloud.transitioning).toBe(true);
            frame(10);
            expect(uniformOf(cloud, 'uBlend')).toBe(0);
            frame(11);
            expect(uniformOf(cloud, 'uBlend')).toBe(0.5);
            // Halfway the smoothed blend is exactly the midpoint of the two formations.
            const a = formation(0);
            const b = formation(1);
            expect(rest(5)[0]).toBeCloseTo((a[15] + b[15]) / 2, 6);

            frame(12);
            expect(cloud.transitioning).toBe(false);
            expect(cloud.activeIndex).toBe(1);
            expect(cloud.preparedIndex).toBe(-1);
            expect(uniformOf(cloud, 'uActive')).toBe(1);
            expect(uniformOf(cloud, 'uBlend')).toBe(0);
            // Now side B is the one shown, and the CPU helper agrees.
            expect(rest(5)[1]).toBe(b[16]);
            // The attributes themselves were never swapped or reallocated.
            expect(cloud.object.geometry.attributes.position).toBe(sideA);
            expect(cloud.object.geometry.attributes.restB).toBe(sideB);
        });

        it('after a swap the other side takes the next formation, going back and forth', () => {
            const { cloud, frame, positions, formation } = setup();
            cloud.prepareFormation(1, SEED);
            for (let i = 0; i < FILL_UPDATES; i++) frame(0);
            cloud.beginTransition(0, 1);
            frame(1);

            cloud.prepareFormation(2, SEED);
            for (let i = 0; i < FILL_UPDATES; i++) frame(1);

            expect(positions('position')).toEqual(formation(2));
            expect(positions('restB')).toEqual(formation(1));
        });

        it('defers the fade while the fill is pending and starts it when the fill completes', () => {
            const { cloud, frame } = setup();
            cloud.prepareFormation(1, SEED);
            frame(5);

            // Asked to start at t = 5, but the fill still needs updates: nothing fades yet.
            cloud.beginTransition(5, 2);
            expect(cloud.transitioning).toBe(true);
            expect(cloud.filling).toBe(true);
            expect(uniformOf(cloud, 'uBlend')).toBe(0);

            frame(6);
            frame(7); // the fill completes in this update, so the fade starts at t = 7
            expect(cloud.filling).toBe(false);
            frame(8);
            expect(cloud.blendProgress).toBeCloseTo(0.5, 6);
            frame(9);
            expect(cloud.transitioning).toBe(false);
            expect(cloud.activeIndex).toBe(1);
        });

        it('keeps a start time in the future when the fill is faster than that', () => {
            const { cloud, frame } = setup();
            cloud.prepareFormation(1, SEED);
            cloud.beginTransition(100, 2);
            for (let i = 0; i < FILL_UPDATES; i++) frame(1);

            frame(101);

            expect(cloud.blendProgress).toBeCloseTo(0.5, 6);
        });

        it('ignores a transition with nothing prepared', () => {
            const { cloud } = setup();

            cloud.beginTransition(0, 2);

            expect(cloud.transitioning).toBe(false);
        });

        it('finishes at once for a zero-length fade', () => {
            const { cloud, frame } = setup();
            cloud.prepareFormation(1, SEED);
            for (let i = 0; i < FILL_UPDATES; i++) frame(0);

            cloud.beginTransition(0, 0);
            frame(0);

            expect(cloud.activeIndex).toBe(1);
        });

        it('does not move any point when a new target arrives mid-fade, then fades to it', () => {
            const { cloud, frame, positions, attributes, formation, rest } = setup();
            const sideA = attributes().position;
            const sideB = attributes().restB;
            cloud.prepareFormation(1, SEED);
            for (let i = 0; i < FILL_UPDATES; i++) frame(0);
            cloud.beginTransition(0, 2);
            frame(0.6);
            const before = [0, 17, 999, POINTS - 1].map(rest);
            // The blend really is somewhere between the two formations.
            expect(cloud.blendProgress).toBeGreaterThan(0.2);

            cloud.prepareFormation(3, SEED);

            // On the retarget frame the picture is identical, with the blend back at 0.
            const after = [0, 17, 999, POINTS - 1].map(rest);
            for (let i = 0; i < before.length; i++) {
                for (let k = 0; k < 3; k++) expect(after[i][k]).toBeCloseTo(before[i][k], 6);
            }
            expect(cloud.blendProgress).toBe(0);
            expect(cloud.transitioning).toBe(false);
            expect(cloud.activeIndex).toBe(-1);
            expect(uniformOf(cloud, 'uBlend')).toBe(0);

            cloud.beginTransition(1, 2);
            for (let i = 0; i < FILL_UPDATES; i++) frame(1);
            frame(3);
            expect(positions('restB')).toEqual(formation(3));
            expect(cloud.activeIndex).toBe(3);
            expect(cloud.object.geometry.attributes.position).toBe(sideA);
            expect(cloud.object.geometry.attributes.restB).toBe(sideB);
        });

        it('restarting toward the same target mid-fade also keeps the picture', () => {
            const { cloud, frame, rest } = setup();
            cloud.prepareFormation(1, SEED);
            for (let i = 0; i < FILL_UPDATES; i++) frame(0);
            cloud.beginTransition(0, 2);
            frame(0.8);
            const before = rest(123);

            cloud.beginTransition(0.8, 2);

            const after = rest(123);
            for (let k = 0; k < 3; k++) expect(after[k]).toBeCloseTo(before[k], 6);
            expect(cloud.transitioning).toBe(true);
        });

        it('uploads the whole baked side, not the earlier partial ranges', () => {
            const { cloud, frame, attributes } = setup();
            cloud.prepareFormation(1, SEED);
            for (let i = 0; i < FILL_UPDATES; i++) frame(0);
            cloud.beginTransition(0, 2);
            frame(1);
            attributes().position.addUpdateRange(0, 3);

            cloud.prepareFormation(2, SEED);

            expect(attributes().position.updateRanges).toEqual([]);
        });
    });

    describe('showFormation', () => {
        it('replaces the active side at once and clears any preparation', () => {
            const { cloud, positions, formation } = setup();
            cloud.prepareFormation(1, SEED);
            cloud.beginTransition(0, 2);

            cloud.showFormation(2, SEED);

            expect(positions('position')).toEqual(formation(2));
            expect(cloud.activeIndex).toBe(2);
            expect(cloud.preparedIndex).toBe(-1);
            expect(cloud.transitioning).toBe(false);
            expect(cloud.filling).toBe(false);
        });
    });

    describe('update', () => {
        it('copies the kick ring into the shader uniforms in the same call', () => {
            const { cloud, kicks, frame } = setup();
            kicks.update({ bumpCount: 0, bumpTarget: 0.9, weight: 1 }, 1.4);
            expect(kicks.update({ bumpCount: 1, bumpTarget: 0.9, weight: 1 }, 1.5)).toBe(true);

            frame(1.5);

            const times = uniformOf(cloud, 'uKickTimes') as Float32Array;
            const strengths = uniformOf(cloud, 'uKickStrengths') as Float32Array;
            expect(times).toHaveLength(KICK_SLOTS);
            expect(Array.from(times)).toEqual(Array.from(kicks.times));
            expect(Array.from(strengths)).toEqual(Array.from(kicks.strengths));
            expect(times[0]).toBeCloseTo(1.5, 6);
            expect(strengths[0]).toBeCloseTo(0.9, 6);
            // Empty slots stay in the distant past.
            expect(times[1]).toBe(-1e6);
        });

        it('keeps the uniform arrays when the ring changes', () => {
            const { cloud, kicks, frame } = setup();
            const times = uniformOf(cloud, 'uKickTimes');
            frame(1);
            kicks.update({ bumpCount: 0, bumpTarget: 0.9, weight: 1 }, 1);
            kicks.update({ bumpCount: 1, bumpTarget: 0.9, weight: 1 }, 2);
            frame(2);

            expect(uniformOf(cloud, 'uKickTimes')).toBe(times);
        });

        it('sets time, tension, breathing, brightness and the palette', () => {
            const { cloud, cue, kicks } = setup();
            cue.tension = 0.4;

            cloud.update(cue, 0.75, kicks, palette, 0.3, 12);

            expect(uniformOf(cloud, 'uTime')).toBe(12);
            expect(uniformOf(cloud, 'uTension')).toBe(0.4);
            expect(uniformOf(cloud, 'uBreath')).toBe(0.75);
            expect(uniformOf(cloud, 'uBrightness')).toBe(0.3);
            expect(Array.from(uniformOf(cloud, 'uCore') as Float32Array)).toEqual(Array.from(palette.core));
            expect(Array.from(uniformOf(cloud, 'uEdge') as Float32Array)).toEqual(Array.from(palette.edge));
        });

        it('takes the spectrum field through setSpectrum', () => {
            const { cloud } = setup();
            const texture = new THREE.DataTexture(new Uint8Array(4), 2, 2, THREE.RedFormat);
            cloud.setSpectrum(texture, 0.3, 0.9);
            expect(uniformOf(cloud, 'uSpectrum')).toBe(texture);
            expect(uniformOf(cloud, 'uSpectrumHead')).toBe(0.3);
            expect(uniformOf(cloud, 'uSpectrumSpan')).toBe(0.9);
            expect(uniformOf(cloud, 'uSpectrumAmp')).toBe(bassInkSceneConfig.spectrum.amplitude);
        });

        it('takes the beat punch through setPunch', () => {
            const { cloud } = setup();
            cloud.setPunch(0.7);
            expect(uniformOf(cloud, 'uPunch')).toBe(0.7);
            expect(uniformOf(cloud, 'uPunchAmp')).toBe(bassInkSceneConfig.cloud.beatPunch);
        });

        it('takes the band onsets and the turbulence control through setTexture', () => {
            const { cloud } = setup();

            cloud.setTexture(0.4, 0.6, 1.5);

            expect(uniformOf(cloud, 'uMid')).toBe(0.4);
            expect(uniformOf(cloud, 'uHigh')).toBe(0.6);
            expect(uniformOf(cloud, 'uTurbulence')).toBe(1.5);
        });

        it('turns the viewport height and field of view into a pixels-per-world-unit scale', () => {
            const { cloud } = setup();

            cloud.setViewport(1000, 90);

            // tan(45 degrees) is 1, so the scale is half the height.
            expect(uniformOf(cloud, 'uPointScale')).toBeCloseTo(500, 6);
        });
    });

    it('never reallocates its attributes through prepare, transition and retarget', () => {
        const { cloud, frame, attributes } = setup();
        const before = { ...attributes() };
        const arrays = Object.fromEntries(Object.entries(before).map(([name, attribute]) => [name, attribute.array]));

        cloud.prepareFormation(1, SEED);
        for (let i = 0; i < FILL_UPDATES; i++) frame(0);
        cloud.beginTransition(0, 2);
        frame(1);
        cloud.prepareFormation(2, SEED);
        for (let i = 0; i < FILL_UPDATES; i++) frame(1);
        cloud.beginTransition(1, 2);
        frame(4);

        for (const [name, attribute] of Object.entries(attributes())) {
            expect(attribute).toBe(before[name]);
            expect(attribute.array).toBe(arrays[name]);
        }
    });

    it('frees its geometry and material on dispose', () => {
        const { cloud } = setup();
        const geometryDispose = vi.fn();
        const materialDispose = vi.fn();
        cloud.object.geometry.addEventListener('dispose', geometryDispose);
        (cloud.object.material as Material).addEventListener('dispose', materialDispose);

        cloud.dispose();

        expect(geometryDispose).toHaveBeenCalledTimes(1);
        expect(materialDispose).toHaveBeenCalledTimes(1);
    });
});
