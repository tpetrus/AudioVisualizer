import { afterEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import {
    ClubSet,
    createFlashLimiter,
    rippleAt,
    rippleEnvelope,
    stepFlashLimiter,
    type FlashLimiterState,
} from './dancingCharacterClub';
import {
    CLUB_BACKGROUND,
    CLUB_FLASH_BASS_THRESHOLD,
    CLUB_MAX_FLASHES_PER_SECOND,
    CLUB_REDUCED_MOTION_FLASH_STRENGTH,
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
        THREE.PlaneGeometry,
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

// The normalized radius of the tile with the highest value of the accent's channel, i.e. the ripple ring's position.
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
    return Math.hypot(position.x, position.z);
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
        expect(floor.count).toBeGreaterThan(100);
        expect(floor.count).toBeLessThanOrEqual(CLUB_TILE_GRID * CLUB_TILE_GRID);
        expect(floor.instanceColor).not.toBeNull();
        expect(floor.geometry.type).toBe('PlaneGeometry');
        expect(cones).toHaveLength(4);
        for (const cone of cones) {
            expect(cone.material.blending).toBe(THREE.AdditiveBlending);
            expect(cone.material.transparent).toBe(true);
            expect(cone.material.depthWrite).toBe(false);
            expect(cone.castShadow).toBe(false);
        }
        expect(scene.children.filter((child) => (child as THREE.PointLight).isPointLight)).toHaveLength(2);
        expect(scene.children.filter((child) => (child as THREE.Light).isLight)).toHaveLength(2);
    });

    it('clips the tiles to a circle and fades the outer ones to the background color', () => {
        const { floor } = setup();
        const matrix = new THREE.Matrix4();
        const position = new THREE.Vector3();
        let outermost = 0;
        let outermostIndex = 0;
        for (let i = 0; i < floor.count; i++) {
            floor.getMatrixAt(i, matrix);
            position.setFromMatrixPosition(matrix);
            const radius = Math.hypot(position.x, position.z);
            if (radius > outermost) {
                outermost = radius;
                outermostIndex = i;
            }
        }
        // Corners of the 16 x 16 grid would be at about 5.3; nothing past the floor radius is built.
        expect(outermost).toBeLessThanOrEqual((CLUB_TILE_GRID * 0.5) / 2);
        const background = new THREE.Color(CLUB_BACKGROUND);
        const edge = tileColor(floor, outermostIndex);
        // The very last ring is almost fully faded: within a few percent of the background brightness.
        expect(edge.r + edge.g + edge.b).toBeLessThan((background.r + background.g + background.b) * 4 + 0.05);
    });

    it('puts the floor and the lights relative to the floor height', () => {
        const { floor, cones, club } = setup();
        club.setFloorY(-0.8);
        expect(floor.position.y).toBeCloseTo(-0.79);
        for (const cone of cones) expect(cone.position.y).toBeGreaterThan(3);
    });
});

describe('floor response', () => {
    it('moves the ripple outward as the beat phase advances', () => {
        const { club, floor } = setup();
        // A pure accent color on a black floor, so the brightest tile of that channel is the ripple.
        club.setColors('#000000', '#ff0000');
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
        expect(floorBrightness(floor)).toBeGreaterThan(quiet * 1.3);
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
