import { afterEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import {
    patternAt,
    ClubSet,
    createFlashLimiter,
    rippleAt,
    rippleEnvelope,
    stepFlashLimiter,
    type FlashLimiterState,
} from './dancingCharacterClub';
import {
    CLUB_BACKGROUND,
    CLUB_CONE_FADE_END,
    CLUB_CONE_HEIGHT,
    CLUB_CONE_RADIUS,
    CLUB_CONE_SWEEP_ANGLE,
    CLUB_CONE_TILT,
    CLUB_FLASH_BASS_THRESHOLD,
    CLUB_MAX_FLASHES_PER_SECOND,
    CLUB_REDUCED_MOTION_FLASH_STRENGTH,
    CLUB_FLOOR_HALF,
    CLUB_PATTERN_BEATS,
    CLUB_PATTERN_FADE_SECONDS,
    CLUB_TILE_GRID,
} from './dancingCharacterConfig';

// Counts the objects created through three's constructors, so a spec can prove a call allocates none. The subclasses
// behave exactly like the originals.
const constructed = vi.hoisted(() => ({ color: 0, vector: 0, matrix: 0 }));
vi.mock('three', async (importOriginal) => {
    const actual = await importOriginal<typeof import('three')>();
    return {
        ...actual,
        Color: class extends actual.Color {
            constructor(...args: ConstructorParameters<typeof actual.Color>) {
                super(...args);
                constructed.color++;
            }
        },
        Vector3: class extends actual.Vector3 {
            constructor(...args: ConstructorParameters<typeof actual.Vector3>) {
                super(...args);
                constructed.vector++;
            }
        },
        Matrix4: class extends actual.Matrix4 {
            constructor() {
                super();
                constructed.matrix++;
            }
        },
    };
});

const FRAME = 1 / 60;

function setup() {
    const scene = new THREE.Scene();
    const club = new ClubSet(scene);
    const floor = scene.children.find((child) => (child as THREE.InstancedMesh).isInstancedMesh) as THREE.InstancedMesh<
        THREE.BufferGeometry,
        THREE.MeshBasicMaterial
    >;
    const cones = scene.children.filter(
        (child) => (child as THREE.Mesh).geometry?.type === 'ConeGeometry',
    ) as THREE.Mesh<THREE.ConeGeometry, THREE.MeshBasicMaterial>[];
    return { scene, club, floor, cones };
}

// The color the tile at `index` will render with (linear channels).
function tileColor(floor: THREE.InstancedMesh, index: number): THREE.Color {
    return floor.getColorAt(index, new THREE.Color());
}

// Sum of all tile channels: a measure of how bright the floor is.
function floorBrightness(floor: THREE.InstancedMesh): number {
    let sum = 0;
    const color = new THREE.Color();
    for (let i = 0; i < floor.count; i++) {
        floor.getColorAt(i, color);
        sum += color.r + color.g + color.b;
    }
    return sum;
}

// The square distance from the center (the larger of |x| and |z|) of the tile with the highest value of a channel, i.e.
// the ripple's position.
function brightestRadius(floor: THREE.InstancedMesh, accent: 'r' | 'g' | 'b'): number {
    let best = -1;
    let bestValue = -Infinity;
    const color = new THREE.Color();
    for (let i = 0; i < floor.count; i++) {
        floor.getColorAt(i, color);
        if (color[accent] > bestValue) {
            bestValue = color[accent];
            best = i;
        }
    }
    const matrix = new THREE.Matrix4();
    floor.getMatrixAt(best, matrix);
    const position = new THREE.Vector3().setFromMatrixPosition(matrix);
    return Math.max(Math.abs(position.x), Math.abs(position.z));
}

// Settles the club (flash and idle) at the given inputs over a second.
function settle(club: ClubSet, beatPhase: number | undefined, bass: number, danceWeight: number, seconds = 1): void {
    for (let i = 0; i < seconds * 60; i++) club.update(beatPhase, bass, danceWeight, FRAME);
}

afterEach(() => {
    vi.restoreAllMocks();
});

describe('ClubSet construction', () => {
    it('sets a dark background color (no texture) and a light fog of the same color', () => {
        const { scene } = setup();
        const background = scene.background as THREE.Color;
        expect(background).toBeInstanceOf(THREE.Color);
        expect(background.getHexString()).toBe(new THREE.Color(CLUB_BACKGROUND).getHexString());
        // Dark: every channel is small.
        expect(Math.max(background.r, background.g, background.b)).toBeLessThan(0.05);
        const fog = scene.fog as THREE.Fog;
        expect(fog).toBeInstanceOf(THREE.Fog);
        expect(fog.color.getHexString()).toBe(background.getHexString());
        expect(fog.far).toBeGreaterThan(fog.near);
    });

    it('adds one instanced mesh of square tiles with a color per tile, four cones and two spill lights', () => {
        const { scene, club, floor, cones } = setup();
        expect(scene.children.filter((child) => (child as THREE.InstancedMesh).isInstancedMesh)).toHaveLength(1);
        expect(club.tileCount).toBe(floor.count);
        expect(floor.count).toBe(CLUB_TILE_GRID * CLUB_TILE_GRID);
        expect(floor.instanceColor).not.toBeNull();
        expect(floor.material.vertexColors).toBe(true);
        expect(cones).toHaveLength(4);
        for (const cone of cones) {
            expect(cone.material.blending).toBe(THREE.AdditiveBlending);
            expect(cone.material.transparent).toBe(true);
            expect(cone.material.depthWrite).toBe(false);
            expect(cone.castShadow).toBe(false);
        }
        expect(scene.children.filter((child) => (child as THREE.PointLight).isPointLight)).toHaveLength(2);
        expect(scene.children.filter((child) => (child as THREE.Light).isLight)).toHaveLength(2);
        // The tiles, the dark plane under their seams and the frame's four bars, plus the cones.
        expect(scene.children.filter((child) => (child as THREE.Mesh).isMesh)).toHaveLength(10);
    });

    it('lays the tiles out as a full square inside a raised frame', () => {
        const { floor, scene } = setup();
        const matrix = new THREE.Matrix4();
        const position = new THREE.Vector3();
        let outermost = 0;
        for (let i = 0; i < floor.count; i++) {
            floor.getMatrixAt(i, matrix);
            position.setFromMatrixPosition(matrix);
            outermost = Math.max(outermost, Math.abs(position.x), Math.abs(position.z));
        }
        expect(outermost).toBeLessThan(CLUB_FLOOR_HALF);
        expect(outermost).toBeGreaterThan(CLUB_FLOOR_HALF * 0.8);
        // The frame's bars surround the tiles on all four sides and stand on the floor.
        const bars = scene.children.filter((child) => (child as THREE.Mesh).geometry?.type === 'BoxGeometry');
        expect(bars).toHaveLength(4);
        const frame = new THREE.Box3();
        for (const bar of bars) frame.union(new THREE.Box3().setFromObject(bar));
        expect(frame.max.x).toBeGreaterThan(CLUB_FLOOR_HALF);
        expect(frame.min.x).toBeLessThan(-CLUB_FLOOR_HALF);
        expect(frame.max.z).toBeGreaterThan(CLUB_FLOOR_HALF);
        expect(frame.min.z).toBeLessThan(-CLUB_FLOOR_HALF);
        expect(frame.min.y).toBeCloseTo(0);
        expect(frame.max.y).toBeGreaterThan(0);
    });

    it('shades each tile as four facets that are brightest where they meet in the middle', () => {
        const { floor } = setup();
        const positions = floor.geometry.getAttribute('position');
        const colors = floor.geometry.getAttribute('color');
        expect(positions.count).toBe(12);
        for (let i = 0; i < positions.count; i++) {
            const atCenter = Math.hypot(positions.getX(i), positions.getZ(i)) < 1e-6;
            if (atCenter) expect(colors.getX(i)).toBe(1);
            else expect(colors.getX(i)).toBeLessThan(1);
            // Every vertex lies flat on the floor.
            expect(positions.getY(i)).toBeCloseTo(0);
        }
    });

    it('puts the floor and the lights relative to the floor height', () => {
        const { floor, cones, club } = setup();
        club.setFloorY(-0.8);
        expect(floor.position.y).toBeCloseTo(-0.79);
        for (const cone of cones) expect(cone.position.y).toBeGreaterThan(3);
    });

    it('shapes each spotlight as a slim beam that is brightest at the source and gone before its far end', () => {
        const { cones, club } = setup();
        const geometry = cones[0].geometry;
        const position = geometry.getAttribute('position');
        const color = geometry.getAttribute('color');
        expect(cones[0].material.vertexColors).toBe(true);
        // A point at the source, a slim disc at the far end.
        let widest = 0;
        let nearSource = 0;
        let beyondFade = 0;
        for (let i = 0; i < position.count; i++) {
            const along = -position.getY(i) / CLUB_CONE_HEIGHT;
            const radius = Math.hypot(position.getX(i), position.getZ(i));
            if (along < 1e-6) {
                expect(radius).toBeCloseTo(0, 5);
                nearSource = Math.max(nearSource, color.getX(i));
            }
            if (along >= CLUB_CONE_FADE_END - 1e-6) beyondFade = Math.max(beyondFade, color.getX(i));
            widest = Math.max(widest, radius);
        }
        expect(widest).toBeCloseTo(CLUB_CONE_RADIUS, 5);
        expect(CLUB_CONE_RADIUS).toBeLessThanOrEqual(0.35);
        expect(nearSource).toBeCloseTo(1, 6);
        expect(beyondFade).toBeCloseTo(0, 6);
        // The fade never brightens going away from the source.
        const byDepth = Array.from({ length: position.count }, (_, i) => [position.getY(i), color.getX(i)]);
        byDepth.sort((a, b) => b[0] - a[0]);
        for (let i = 1; i < byDepth.length; i++) expect(byDepth[i][1]).toBeLessThanOrEqual(byDepth[i - 1][1] + 1e-9);
        club.dispose();
    });

    it('keeps every visible part of every beam at least one unit from a camera orbiting the dancer', () => {
        const { cones, club } = setup();
        club.setFloorY(0);
        // A close orbit at about eye height (the default framing is farther out, and the bass dolly never pulls the
        // camera in past this).
        const cameraHeight = 1.4;
        const cameraRing = 3;
        const start = new THREE.Vector3();
        const direction = new THREE.Vector3();
        const point = new THREE.Vector3();
        const camera = new THREE.Vector3();
        let closest = Infinity;
        for (const cone of cones) {
            for (const tiltX of [-CLUB_CONE_SWEEP_ANGLE, 0, CLUB_CONE_SWEEP_ANGLE]) {
                for (const tiltZ of [-CLUB_CONE_SWEEP_ANGLE, 0, CLUB_CONE_SWEEP_ANGLE]) {
                    cone.rotation.x = CLUB_CONE_TILT + tiltX;
                    cone.rotation.z = tiltZ;
                    cone.updateMatrixWorld(true);
                    start.setFromMatrixPosition(cone.matrixWorld);
                    direction.set(0, -1, 0).transformDirection(cone.matrixWorld);
                    for (let step = 0; step <= 20; step++) {
                        point
                            .copy(start)
                            .addScaledVector(direction, (step / 20) * CLUB_CONE_FADE_END * CLUB_CONE_HEIGHT);
                        for (let azimuth = 0; azimuth < 72; azimuth++) {
                            const a = (azimuth / 72) * Math.PI * 2;
                            camera.set(Math.cos(a) * cameraRing, cameraHeight, Math.sin(a) * cameraRing);
                            closest = Math.min(closest, point.distanceTo(camera));
                        }
                    }
                }
            }
        }
        expect(closest).toBeGreaterThan(1);
        club.dispose();
    });
});

describe('floor response', () => {
    it('moves the ripple outward as the beat phase advances', () => {
        const { club, floor } = setup();
        // Black patterns, so the brightest tile is the ripple lightening its tiles toward white.
        club.setRainbow(false, 0);
        club.setColors('#000000', '#000000');
        const radii = [0.2, 0.35, 0.5].map((phase) => {
            club.update(phase, 0, 1, FRAME);
            return brightestRadius(floor, 'r');
        });
        expect(radii[1]).toBeGreaterThan(radii[0]);
        expect(radii[2]).toBeGreaterThan(radii[1]);
    });

    it('wraps from one beat to the next without a jump', () => {
        const { club, floor } = setup();
        club.update(0.999, 0, 1, FRAME);
        const before = floorBrightness(floor);
        club.update(0.0, 0, 1, FRAME);
        const after = floorBrightness(floor);
        // Only the smooth cosine pulse is left across the wrap: no sudden brightness change.
        expect(Math.abs(after - before) / before).toBeLessThan(0.02);
    });

    it('lifts the brightness on a bass hit', () => {
        const { club, floor } = setup();
        settle(club, 0.5, 0, 1);
        const quiet = floorBrightness(floor);
        club.update(0.5, 1, 1, FRAME);
        expect(floorBrightness(floor)).toBeGreaterThan(quiet * 1.1);
    });

    it('stays dim and calm with no beat phase, and dimmer with a low dance weight', () => {
        const { club, floor } = setup();
        club.setColors('#000000', '#ff0000');
        club.update(0.35, 0, 1, FRAME);
        const withBeat = floorBrightness(floor);
        club.update(undefined, 0, 1, FRAME);
        const withoutBeat = floorBrightness(floor);
        expect(withoutBeat).toBeLessThan(withBeat);

        club.update(0.35, 0, 0.1, FRAME);
        expect(floorBrightness(floor)).toBeLessThan(withBeat);
    });

    it('shimmers slowly while idle, and reacts to new colors', () => {
        const { club, floor } = setup();
        club.update(undefined, 0, 0, 0);
        const first = floorBrightness(floor);
        club.update(undefined, 0, 0, 1);
        expect(floorBrightness(floor)).not.toBe(first);
        club.setColors('#ffffff', '#ffffff');
        club.update(undefined, 0, 0, 0);
        expect(floorBrightness(floor)).toBeGreaterThan(first);
    });

    it('treats a phase of exactly 1 or above like its fraction', () => {
        const a = setup();
        const b = setup();
        a.club.update(1.25, 0, 1, FRAME);
        b.club.update(0.25, 0, 1, FRAME);
        expect(floorBrightness(a.floor)).toBeCloseTo(floorBrightness(b.floor));
    });
});

describe('floor patterns', () => {
    it('places each tile on the color wheel by pattern', () => {
        // Diagonal bands and columns grow across the floor, the rings grow from the middle and the checkerboard
        // alternates by half the wheel.
        expect(patternAt(0, 1, 1, 0, 0, 0)).toBeGreaterThan(patternAt(0, 0, 0, 0, 0, 0));
        expect(patternAt(1, 0, 0, 1, 0, 0)).toBeGreaterThan(patternAt(1, 0, 0, 0, 0, 0));
        expect(patternAt(2, 1, 0, 0, 0, 0)).toBeGreaterThan(patternAt(2, 0, 0, 0, 0, 0));
        expect(patternAt(3, 0, 0, 0, 1, 0) - patternAt(3, 0, 0, 0, 0, 0)).toBe(0.5);
        // The drift moves every pattern; the rings move outward (their value falls over time at a fixed place).
        expect(patternAt(0, 0.5, 0.5, 0, 0, 0.1)).toBeGreaterThan(patternAt(0, 0.5, 0.5, 0, 0, 0));
        expect(patternAt(1, 0, 0, 0.5, 0, 0.1)).toBeLessThan(patternAt(1, 0, 0, 0.5, 0, 0));
    });

    it('moves to the next pattern after a run of beats, with a slow cross-fade', () => {
        const { club, floor } = setup();
        expect(club.currentPattern).toBe(0);
        const before = tileColor(floor, 0).getHexString();
        for (let beat = 0; beat < CLUB_PATTERN_BEATS; beat++) {
            for (let f = 0; f < 30; f++) club.update(f / 30, 0, 1, FRAME);
        }
        club.update(0, 0, 1, FRAME);
        expect(club.currentPattern).toBe(1);
        // Half way through the fade the floor is between the two patterns, not on either.
        settle(club, 0.5, 0, 1, CLUB_PATTERN_FADE_SECONDS / 2);
        expect(tileColor(floor, 0).getHexString()).not.toBe(before);
        settle(club, 0.5, 0, 1, CLUB_PATTERN_FADE_SECONDS);
        expect(club.currentPattern).toBe(1);
    });

    it('also changes pattern on time alone while no beat is known', () => {
        const { club } = setup();
        settle(club, undefined, 0, 0.5, 9);
        expect(club.currentPattern).toBe(1);
    });

    it('shifts the rainbow with the hue offset and lights the dancer with the floor colors', () => {
        const { club, floor, scene } = setup();
        club.setRainbow(true, 0);
        club.update(undefined, 0, 1, 0);
        const first = tileColor(floor, 0).getHexString();
        club.setRainbow(true, 0.5);
        club.update(undefined, 0, 1, 0);
        expect(tileColor(floor, 0).getHexString()).not.toBe(first);
        const spill = scene.children.filter((child) => (child as THREE.PointLight).isPointLight) as THREE.PointLight[];
        expect(spill[0].color.getHexString()).not.toBe(spill[1].color.getHexString());
    });

    it('blends between the floor and accent colors when the rainbow is off', () => {
        const { club, floor, scene } = setup();
        club.setRainbow(false, 0);
        club.setColors('#0000ff', '#ff0000');
        club.update(undefined, 0, 1, 0);
        for (let i = 0; i < floor.count; i++) expect(tileColor(floor, i).g).toBeCloseTo(0);
        const spill = scene.children.filter((child) => (child as THREE.PointLight).isPointLight) as THREE.PointLight[];
        expect(spill[0].color.getHexString()).toBe('ff0000');
        expect(spill[1].color.getHexString()).toBe('0000ff');
    });
});

describe('spotlights', () => {
    it('sweeps faster with a higher dance weight', () => {
        const calm = setup();
        const lively = setup();
        const start = calm.cones[0].rotation.x;
        for (let i = 0; i < 30; i++) {
            calm.club.update(undefined, 0, 0, FRAME);
            lively.club.update(undefined, 0, 1, FRAME);
        }
        expect(calm.cones[0].rotation.x).not.toBeCloseTo(start);
        expect(Math.abs(lively.cones[0].rotation.x - start)).not.toBeCloseTo(
            Math.abs(calm.cones[0].rotation.x - start),
        );
    });

    it('flashes on bass and fades smoothly afterwards', () => {
        const { club, cones } = setup();
        settle(club, undefined, 0, 0.5);
        const quiet = cones[0].material.opacity;
        club.update(undefined, 1, 0.5, FRAME);
        const flashed = cones[0].material.opacity;
        expect(flashed).toBeGreaterThan(quiet * 2);
        club.update(undefined, 0, 0.5, FRAME);
        const next = cones[0].material.opacity;
        expect(next).toBeLessThan(flashed);
        expect(next).toBeGreaterThan(quiet);
    });
});

describe('flash limiter', () => {
    it('allows the first flash at once and then waits 1 / CLUB_MAX_FLASHES_PER_SECOND', () => {
        const state = createFlashLimiter();
        expect(stepFlashLimiter(state, 1, FRAME)).toBe(true);
        expect(state.level).toBe(1);
        let frames = 0;
        while (!stepFlashLimiter(state, 1, FRAME)) frames++;
        expect((frames + 1) * FRAME).toBeGreaterThanOrEqual(1 / CLUB_MAX_FLASHES_PER_SECOND);
    });

    it('does not flash below the bass threshold, and the level only decays', () => {
        const state: FlashLimiterState = createFlashLimiter();
        expect(stepFlashLimiter(state, CLUB_FLASH_BASS_THRESHOLD - 0.01, FRAME)).toBe(false);
        expect(state.level).toBe(0);
        stepFlashLimiter(state, 1, FRAME);
        const peak = state.level;
        stepFlashLimiter(state, 0, FRAME);
        expect(state.level).toBeLessThan(peak);
        expect(state.level).toBeGreaterThan(0);
    });

    it('never starts a new flash with a weaker one when a stronger one is still fading', () => {
        const state = createFlashLimiter();
        stepFlashLimiter(state, 1, FRAME);
        // Wait out the interval with a quiet signal, then hit again at the threshold.
        for (let i = 0; i < 20; i++) stepFlashLimiter(state, 0, FRAME);
        const before = state.level;
        stepFlashLimiter(state, CLUB_FLASH_BASS_THRESHOLD, FRAME);
        expect(state.level).toBeGreaterThanOrEqual(before);
    });

    // Counts the frames where the cones' brightness (a large-area flash) jumps up, in every one-second window.
    function maxJumpsPerSecond(drive: (frame: number) => { beatPhase: number; bass: number }): number {
        const { club, cones } = setup();
        const jumpFrames: number[] = [];
        let previous = cones[0].material.opacity;
        for (let frame = 0; frame < 600; frame++) {
            const { beatPhase, bass } = drive(frame);
            club.update(beatPhase, bass, 1, FRAME);
            const opacity = cones[0].material.opacity;
            if (opacity - previous > 0.02) jumpFrames.push(frame);
            previous = opacity;
        }
        let worst = 0;
        for (let i = 0; i < jumpFrames.length; i++) {
            let count = 0;
            for (let j = i; j < jumpFrames.length && jumpFrames[j] < jumpFrames[i] + 60; j++) count++;
            worst = Math.max(worst, count);
        }
        return worst;
    }

    it.each([180, 200])('flashes at most 3 times in any second at %i BPM with bass on every frame', (bpm) => {
        const worst = maxJumpsPerSecond((frame) => ({ beatPhase: ((frame * FRAME * bpm) / 60) % 1, bass: 1 }));
        expect(worst).toBeGreaterThan(0);
        expect(worst).toBeLessThanOrEqual(3);
    });

    it('flashes at most 3 times in any second with bass hits at 6 Hz', () => {
        const worst = maxJumpsPerSecond((frame) => ({
            beatPhase: ((frame * FRAME * 180) / 60) % 1,
            // 10 frames per hit: one frame of full bass, the rest silent.
            bass: frame % 10 === 0 ? 1 : 0,
        }));
        expect(worst).toBeGreaterThan(0);
        expect(worst).toBeLessThanOrEqual(3);
    });

    it('also caps the floor lift (brightness jumps of the whole floor)', () => {
        const { club, floor } = setup();
        const jumpFrames: number[] = [];
        let previous = floorBrightness(floor);
        for (let frame = 0; frame < 600; frame++) {
            club.update(undefined, 1, 1, FRAME);
            const brightness = floorBrightness(floor);
            if (brightness > previous * 1.1) jumpFrames.push(frame);
            previous = brightness;
        }
        for (let i = 0; i < jumpFrames.length; i++) {
            const inWindow = jumpFrames.filter((f) => f >= jumpFrames[i] && f < jumpFrames[i] + 60);
            expect(inWindow.length).toBeLessThanOrEqual(3);
        }
        expect(jumpFrames.length).toBeGreaterThan(0);
    });
});

describe('reduced motion', () => {
    it('lowers the peak brightness of the flash with setFlashStrength', () => {
        const full = setup();
        const reduced = setup();
        reduced.club.setFlashStrength(CLUB_REDUCED_MOTION_FLASH_STRENGTH);
        full.club.update(undefined, 1, 1, FRAME);
        reduced.club.update(undefined, 1, 1, FRAME);

        expect(reduced.club.flashLevel).toBeCloseTo(CLUB_REDUCED_MOTION_FLASH_STRENGTH);
        expect(full.club.flashLevel).toBeCloseTo(1);
        expect(reduced.cones[0].material.opacity).toBeLessThan(full.cones[0].material.opacity);
        expect(floorBrightness(reduced.floor)).toBeLessThan(floorBrightness(full.floor));
    });

    it('clamps the strength to 0..1', () => {
        const { club } = setup();
        club.update(undefined, 1, 1, FRAME);
        club.setFlashStrength(5);
        expect(club.flashLevel).toBeCloseTo(1);
        club.setFlashStrength(-1);
        expect(club.flashLevel).toBe(0);
    });
});

describe('ripple shape', () => {
    it('is silent at the start and end of a beat and peaks in the middle', () => {
        expect(rippleEnvelope(0)).toBe(0);
        expect(rippleEnvelope(1)).toBe(0);
        expect(rippleEnvelope(0.3)).toBe(1);
        expect(rippleAt(0.3 * 1.1, 0.3)).toBeCloseTo(1);
        expect(rippleAt(0.9, 0.3)).toBeLessThan(0.01);
    });
});

describe('allocation', () => {
    it('allocates no colors, vectors or matrices in update', () => {
        const { club, floor } = setup();
        club.update(0.2, 0.5, 0.8, FRAME);
        const instanceColor = floor.instanceColor;
        const colorArray = instanceColor!.array;
        constructed.color = constructed.vector = constructed.matrix = 0;

        for (let i = 0; i < 120; i++) club.update((i / 60) % 1, i % 5 === 0 ? 1 : 0, 0.8, FRAME);

        expect(constructed).toEqual({ color: 0, vector: 0, matrix: 0 });
        // The same attribute and array are reused.
        expect(floor.instanceColor).toBe(instanceColor);
        expect(floor.instanceColor!.array).toBe(colorArray);
    });
});

describe('dispose', () => {
    it('frees every geometry, material and the instanced mesh, removes the children and clears background and fog', () => {
        const { scene, club, floor, cones } = setup();
        const disposals = [
            vi.spyOn(floor.geometry, 'dispose'),
            vi.spyOn(floor.material, 'dispose'),
            vi.spyOn(floor, 'dispose'),
            vi.spyOn(cones[0].geometry, 'dispose'),
            ...cones.map((cone) => vi.spyOn(cone.material, 'dispose')),
        ];

        club.dispose();

        for (const spy of disposals) expect(spy).toHaveBeenCalled();
        expect(scene.children).toHaveLength(0);
        expect(scene.background).toBeNull();
        expect(scene.fog).toBeNull();
    });

    it('is safe to call twice and leaves a background that something else set', () => {
        const { scene, club } = setup();
        const other = new THREE.Color('#ff0000');
        scene.background = other;
        scene.fog = null;
        club.dispose();
        expect(() => club.dispose()).not.toThrow();
        expect(scene.background).toBe(other);
    });
});
