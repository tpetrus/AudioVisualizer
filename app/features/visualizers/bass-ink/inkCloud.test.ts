import * as THREE from 'three';
import type { BufferAttribute, Material } from 'three';
import { describe, expect, it, vi } from 'vitest';
import { bassInkSceneConfig } from './bassInkSceneConfig';
import { KICK_SLOTS, type DirectorCue, type PalettePair } from './bassInkTypes';
import { writeFormation } from './formations';
import { InkCloud } from './inkCloud';
import { depthFade, flowDiscPoint, inkVertexShader } from '../meshes/inkShaders';
import { bassInkConfig } from './bassInkConfig';
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
            // Two chunks before an upload are one growing range, not two.
            expect(attribute.updateRanges).toEqual([{ start: 0, count: CHUNK * 6 }]);
            attribute.clearUpdateRanges();
            frame();
            expect(attribute.updateRanges).toMatchObject([{ start: CHUNK * 6 }]);
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

    describe('setRadius', () => {
        it('starts at the configured radius and sets the world radius uniform', () => {
            const { cloud } = setup();
            expect(uniformOf(cloud, 'uRadius')).toBe(bassInkSceneConfig.cloud.radius);

            cloud.setRadius(5.25);

            expect(uniformOf(cloud, 'uRadius')).toBe(5.25);
        });

        it('keeps the depth fade range symmetric around the cloud center, following the radius', () => {
            const { cloud } = setup();
            const { halfRange, fade } = bassInkSceneConfig.depth;
            expect(uniformOf(cloud, 'uDepthFade')).toBe(fade);

            for (const radius of [bassInkSceneConfig.cloud.radius, 2, 5.25]) {
                cloud.setRadius(radius);
                const near = uniformOf(cloud, 'uDepthNear') as number;
                const far = uniformOf(cloud, 'uDepthFar') as number;
                // Offsets from the center's view depth: independent of where the camera is.
                expect(near).toBeLessThan(0);
                expect(far).toBeGreaterThan(0);
                expect(near).toBeCloseTo(-radius * halfRange, 12);
                expect(far).toBeCloseTo(radius * halfRange, 12);
                expect(near + far).toBeCloseTo(0, 12);
                // The values the cloud really sets: the far side is at most half as bright as the near side.
                const uFade = uniformOf(cloud, 'uDepthFade') as number;
                expect(depthFade(far, near, far, uFade) / depthFade(near, near, far, uFade)).toBeLessThanOrEqual(0.5);
            }
            expect(uniformOf(cloud, 'uDepthFade')).toBe(fade);
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

        it('computes the surface scale from its uniforms, matching the vertex shader line', () => {
            const { cloud, cue, kicks } = setup();
            // The same factors in the same order as the shader's `breath` and `scale` lines.
            expect(inkVertexShader).toContain(
                'float breath = (1.0 + uBreathAmp * sin(6.2831853 * uBreath)) * (1.0 + uPunchAmp * uPunch) * (1.0 + uSwellAmp * uSwell);',
            );
            expect(inkVertexShader).toContain('float scale = uRadius * (1.0 - uTension * uSqueeze) * breath;');

            cloud.update(cue, 0, kicks, palette, 0.1, 0);
            expect(cloud.surfaceScale).toBe(1);

            cue.tension = 1;
            cloud.update(cue, 0, kicks, palette, 0.1, 0);
            expect(cloud.surfaceScale).toBeCloseTo(1 - bassInkSceneConfig.cloud.tensionSqueeze, 9);
            expect(cloud.surfaceScale).toBeLessThan(1);

            cue.tension = 0;
            cloud.update(cue, 0, kicks, palette, 0.1, 0);
            cloud.setSwell(1);
            expect(cloud.surfaceScale).toBeGreaterThan(1);
            cloud.setPunch(1);
            cloud.update(cue, 0.25, kicks, palette, 0.1, 0);
            expect(Number.isFinite(cloud.surfaceScale)).toBe(true);
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

        // The swell is the reaction shown before the beat locks, so it outweighs the punch on purpose (see contracts.md,
        // "Instant bass swell").
        it('takes the bass swell through setSwell, with a constant amplitude above the beat punch', () => {
            const { cloud } = setup();
            expect(uniformOf(cloud, 'uSwell')).toBe(0);
            cloud.setSwell(0.8);
            expect(uniformOf(cloud, 'uSwell')).toBe(0.8);
            expect(uniformOf(cloud, 'uSwellAmp')).toBe(bassInkSceneConfig.cloud.swellAmplitude);
            expect(bassInkSceneConfig.cloud.swellAmplitude).toBeGreaterThan(bassInkSceneConfig.cloud.beatPunch);
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

    describe('galaxy disc flow', () => {
        const TWIST = bassInkConfig.formations.discTwist;
        const flowed = (point: ArrayLike<number>, phase: number) => {
            const out = [0, 0, 0];
            flowDiscPoint(point, phase, TWIST, out);
            return out;
        };

        it('flows only the side that holds the disc, and keeps it with that side through a fade', () => {
            const { cloud, frame } = setup();
            expect(uniformOf(cloud, 'uFlowA')).toBe(0);
            expect(uniformOf(cloud, 'uFlowB')).toBe(0);
            expect(uniformOf(cloud, 'uDiscTwist')).toBe(TWIST);

            cloud.prepareFormation(3, SEED);
            expect(uniformOf(cloud, 'uFlowB')).toBe(1);
            for (let i = 0; i < FILL_UPDATES; i++) frame(0);
            cloud.beginTransition(0, 2);
            frame(2);
            expect(cloud.activeIndex).toBe(3);
            expect(uniformOf(cloud, 'uFlowB')).toBe(1);
            expect(uniformOf(cloud, 'uFlowA')).toBe(0);

            // The next formation goes to side A, which flows only when it holds the disc.
            cloud.prepareFormation(1, SEED);
            expect(uniformOf(cloud, 'uFlowA')).toBe(0);
            cloud.showFormation(0, SEED);
            expect(uniformOf(cloud, 'uFlowB')).toBe(0);
            cloud.showFormation(3, SEED);
            expect(uniformOf(cloud, 'uFlowB')).toBe(1);
        });

        it('takes the phase through setFlow and gives the spray the flowed disc point', () => {
            const { cloud, formation, rest } = setup();
            cloud.showFormation(3, SEED);
            cloud.setFlow(0.3);
            expect(uniformOf(cloud, 'uFlowPhase')).toBe(0.3);
            const disc = formation(3);
            for (const point of [0, 17, POINTS - 1]) {
                const expected = flowed(disc.subarray(point * 3, point * 3 + 3), 0.3);
                const got = rest(point);
                for (let k = 0; k < 3; k++) expect(got[k]).toBeCloseTo(expected[k], 6);
            }
        });

        it('leaves every other formation where it is, whatever the phase', () => {
            const { cloud, formation, rest } = setup();
            cloud.setFlow(0.3);
            const sphere = formation(0);
            expect(rest(17)).toEqual(Array.from(sphere.subarray(51, 54)));
        });

        it('bakes the flow in with the blend when a new target arrives mid-fade from the disc', () => {
            const { cloud, frame, positions, rest } = setup();
            cloud.showFormation(3, SEED);
            cloud.setFlow(0.42);
            cloud.prepareFormation(1, SEED);
            for (let i = 0; i < FILL_UPDATES; i++) frame(0);
            cloud.beginTransition(0, 2);
            frame(0.7);
            const points = [0, 17, 999, POINTS - 1];
            const before = points.map(rest);

            cloud.prepareFormation(2, SEED);

            // The baked side no longer flows, and holds exactly what was drawn.
            expect(cloud.activeIndex).toBe(-1);
            expect(uniformOf(cloud, 'uFlowA')).toBe(0);
            const baked = positions('position');
            points.forEach((point, i) => {
                for (let k = 0; k < 3; k++) expect(baked[point * 3 + k]).toBeCloseTo(before[i][k], 6);
            });
            // A later phase leaves the frozen picture alone.
            cloud.setFlow(0.9);
            const after = rest(17);
            for (let k = 0; k < 3; k++) expect(after[k]).toBeCloseTo(before[1][k], 6);
        });
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

describe('InkCloud options', () => {
    const { cloud: c, wave, spectrum, turbulence, sprite } = bassInkSceneConfig;
    // Every displacement uniform an option may change, with the value the config gives it at a scale.
    const scaled = (scale: number) => ({
        uWaveAmp: wave.amplitude * scale,
        uWaveMax: wave.maxDisplacement * scale,
        uSpectrumAmp: spectrum.amplitude * scale,
        uNoiseBase: turbulence.base * scale,
        uNoiseMid: turbulence.midGain * scale,
    });
    // The numeric uniforms, to compare the untouched ones between two clouds.
    const plain = (cloud: InkCloud): Record<string, unknown> =>
        Object.fromEntries(
            Object.entries(
                (cloud.object.material as unknown as { uniforms: Record<string, { value: unknown }> }).uniforms,
            )
                .filter(([, u]) => typeof u.value === 'number')
                .map(([name, u]) => [name, u.value]),
        );

    it('leaves every uniform as it was when no options are given', () => {
        const cloud = new InkCloud(100, SEED, 64);
        expect(uniformOf(cloud, 'uSwellAmp')).toBe(c.swellAmplitude);
        expect(uniformOf(cloud, 'uAlpha')).toBe(sprite.baseAlpha);
        for (const [name, value] of Object.entries(scaled(1))) {
            expect(uniformOf(cloud, name)).toBe(value);
        }
        expect(plain(new InkCloud(100, SEED, 64, {}))).toEqual(plain(cloud));
    });

    it('sets the four band tint uniforms from the config, whatever the options', () => {
        const { bands } = bassInkSceneConfig;
        for (const cloud of [
            new InkCloud(100, SEED, 64),
            new InkCloud(100, SEED, 64, { displacementScale: 0.5, alphaScale: 2 }),
        ]) {
            expect(uniformOf(cloud, 'uBassTint')).toBe(bands.bassTint);
            expect(uniformOf(cloud, 'uSwellTint')).toBe(bands.swellTint);
            expect(uniformOf(cloud, 'uHighTint')).toBe(bands.highTint);
            expect(uniformOf(cloud, 'uHighWhite')).toBe(bands.highWhite);
        }
    });

    it('swellAmplitude sets uSwellAmp and nothing else', () => {
        const base = plain(new InkCloud(100, SEED, 64));
        const cloud = new InkCloud(100, SEED, 64, { swellAmplitude: 0.35 });
        expect(uniformOf(cloud, 'uSwellAmp')).toBe(0.35);
        expect({ ...plain(cloud), uSwellAmp: base.uSwellAmp }).toEqual(base);
    });

    it('displacementScale multiplies the five displacement uniforms and nothing else', () => {
        const base = plain(new InkCloud(100, SEED, 64));
        const cloud = new InkCloud(100, SEED, 64, { displacementScale: 0.35 });
        const expected = scaled(0.35);
        for (const [name, value] of Object.entries(expected)) {
            expect(uniformOf(cloud, name)).toBeCloseTo(value, 12);
        }
        const rest = { ...plain(cloud) };
        for (const name of Object.keys(expected)) {
            rest[name] = base[name];
        }
        expect(rest).toEqual(base);
    });

    it('alphaScale multiplies uAlpha and nothing else', () => {
        const base = plain(new InkCloud(100, SEED, 64));
        const cloud = new InkCloud(100, SEED, 64, { alphaScale: 0.6 });
        expect(uniformOf(cloud, 'uAlpha')).toBeCloseTo(sprite.baseAlpha * 0.6, 12);
        expect({ ...plain(cloud), uAlpha: base.uAlpha }).toEqual(base);
    });

    it('keeps the scaled values through update and the per-frame setters', () => {
        const cloud = new InkCloud(100, SEED, 64, { swellAmplitude: 0.35, displacementScale: 0.5, alphaScale: 0.6 });
        cloud.update(makeCue(), 0.25, new KickRing(), palette, 0.1, 1);
        cloud.setRadius(3);
        cloud.setPunch(1);
        cloud.setSwell(1);
        cloud.setTexture(1, 1, 2);
        expect(uniformOf(cloud, 'uSwellAmp')).toBe(0.35);
        expect(uniformOf(cloud, 'uWaveMax')).toBeCloseTo(wave.maxDisplacement * 0.5, 12);
        expect(uniformOf(cloud, 'uAlpha')).toBeCloseTo(sprite.baseAlpha * 0.6, 12);
    });
});
