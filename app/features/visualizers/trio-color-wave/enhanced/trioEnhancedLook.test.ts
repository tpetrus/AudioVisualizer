import * as THREE from 'three';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { RhythmTracker } from '~/features/rhythm/rhythmTracker';
import { BANDS, FLAG_DEPTH, FLAG_WIDTH, BAR_OPACITY } from '../trioColorWaveConfig';
import { TrioColorWaveSheet } from '../trioColorWaveSheet';
import type { TrioLookControlValues } from '../trioLookControls';
import {
    ACCENT_PEAK_CAP,
    ACCENT_REDUCED_MOTION_FACTOR,
    BLOOM_RESOLUTION_SHARE,
    DENSE_COLUMNS,
    DUST_COUNT,
    HAZE_MAX,
    SHOCKWAVE_POOL_SIZE,
} from './trioEnhancedConfig';
import { createTrioEnhancedLook } from './trioEnhancedLook';
import { type RingUniforms, SHOCKWAVE_RING_NAME } from './trioShockwave';
import type { TrioEnhancedLook } from './trioEnhancedTypes';

// The passes run shaders, so they are replaced by recorders. vi.mock is hoisted, hence the hoisted record.
const rec = vi.hoisted(() => {
    class Pass {
        enabled = true;
        dispose = vi.fn();
        sizes: [number, number][] = [];
        setSize(width: number, height: number) {
            this.sizes.push([width, height]);
        }
    }
    return {
        Pass,
        composers: [] as unknown[],
        blooms: [] as unknown[],
        renders: [] as unknown[],
        outputs: [] as unknown[],
        failOutput: false,
    };
});

vi.mock('three/addons/postprocessing/EffectComposer.js', () => ({
    EffectComposer: class {
        passes: unknown[] = [];
        size: [number, number] | undefined;
        render = vi.fn();
        dispose = vi.fn();
        setSize = vi.fn((width: number, height: number) => {
            this.size = [width, height];
        });
        addPass = vi.fn((pass: unknown) => {
            this.passes.push(pass);
        });
        constructor(public renderer: unknown) {
            rec.composers.push(this);
        }
    },
}));
vi.mock('three/addons/postprocessing/RenderPass.js', () => ({
    RenderPass: class extends rec.Pass {
        constructor(
            public scene: unknown,
            public camera: unknown,
        ) {
            super();
            rec.renders.push(this);
        }
    },
}));
vi.mock('three/addons/postprocessing/OutputPass.js', () => ({
    OutputPass: class extends rec.Pass {
        constructor() {
            super();
            if (rec.failOutput) throw new Error('pass failed');
            rec.outputs.push(this);
        }
    },
}));
vi.mock('three/addons/postprocessing/UnrealBloomPass.js', () => ({
    UnrealBloomPass: class extends rec.Pass {
        constructor(
            public resolution: { x: number; y: number },
            public strength: number,
            public radius: number,
            public threshold: number,
        ) {
            super();
            rec.blooms.push(this);
        }
    },
}));

type Pass = InstanceType<typeof rec.Pass>;
type Bloom = Pass & { resolution: THREE.Vector2; strength: number; radius: number; threshold: number };
type Composer = {
    passes: Pass[];
    size: [number, number] | undefined;
    render: ReturnType<typeof vi.fn>;
    dispose: ReturnType<typeof vi.fn>;
};
const composers = () => rec.composers as Composer[];
const blooms = () => rec.blooms as Bloom[];

interface Setup {
    look: TrioEnhancedLook;
    scene: THREE.Scene;
    sheets: TrioColorWaveSheet[];
    values: { current: TrioLookControlValues };
    reduced: { matches: boolean };
    rhythm: {
        updatePhase: ReturnType<typeof vi.fn>;
        state: { beatCount: number; downbeatCount: number; bandOnsets: number[] };
    };
    standardMeshes: THREE.Object3D[];
}

function setup(withRhythm = true, pixelRatio = 2): Setup {
    const renderer = { getPixelRatio: () => pixelRatio } as unknown as THREE.WebGLRenderer;
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera();
    const sheets = BANDS.map((band, index) => new TrioColorWaveSheet(band, index, BANDS.length));
    sheets.forEach((sheet) => {
        sheet.place(0, 0);
        scene.add(sheet.flags.mesh);
    });
    const values = { current: { glowStrength: 1, accentIntensity: 1, depth: 1, dust: 1 } as TrioLookControlValues };
    const reduced = { matches: false };
    const rhythm = { updatePhase: vi.fn(), state: { beatCount: 0, downbeatCount: 0, bandOnsets: [0, 0, 0] } };
    const look = createTrioEnhancedLook({
        renderer,
        scene,
        camera,
        sheets: sheets.map((sheet) => sheet.flags),
        size: { width: 800, height: 600 },
        valuesRef: values,
        rhythm: withRhythm ? (rhythm as unknown as RhythmTracker) : undefined,
        reducedMotion: reduced,
    });
    return { look, scene, sheets, values, reduced, rhythm, standardMeshes: sheets.map((sheet) => sheet.flags.mesh) };
}

const bloom = () => blooms().at(-1)!;
const composer = () => composers().at(-1)!;

// Fires one accepted beat: the first frame records the counter, the second sees it rise.
function beat(s: Setup, count: number, dt = 1 / 60) {
    s.rhythm.state.beatCount = count;
    s.look.render(dt);
}

beforeEach(() => {
    rec.composers.length = 0;
    rec.blooms.length = 0;
    rec.renders.length = 0;
    rec.outputs.length = 0;
    rec.failOutput = false;
});

describe('createTrioEnhancedLook build', () => {
    it('adds the look to the scene and leaves the standard meshes untouched until setMix', () => {
        const { scene, standardMeshes, sheets } = setup();
        for (const mesh of standardMeshes) {
            expect(scene.children).toContain(mesh);
            expect(mesh.visible).toBe(true);
        }
        for (const sheet of sheets) expect(sheet.flags.material.uniforms.opacity.value).toBe(BAR_OPACITY);
        // 3 standard + 3 dense + backdrop + dust + the ring pool
        expect(scene.children).toHaveLength(3 + 3 + 1 + 1 + SHOCKWAVE_POOL_SIZE);
        expect(composer().passes).toHaveLength(3);
        expect(composer().size).toEqual([800, 600]);
    });

    it('leaves the scene and the standard meshes as they were when a pass constructor throws', () => {
        const renderer = { getPixelRatio: () => 2 } as unknown as THREE.WebGLRenderer;
        const scene = new THREE.Scene();
        const sheets = BANDS.map((band, index) => new TrioColorWaveSheet(band, index, BANDS.length));
        for (const sheet of sheets) scene.add(sheet.flags.mesh);
        rec.failOutput = true;

        expect(() =>
            createTrioEnhancedLook({
                renderer,
                scene,
                camera: new THREE.PerspectiveCamera(),
                sheets: sheets.map((sheet) => sheet.flags),
                size: { width: 800, height: 600 },
                valuesRef: { current: { glowStrength: 1, accentIntensity: 1, depth: 1, dust: 1 } },
                rhythm: undefined,
                reducedMotion: { matches: false },
            }),
        ).toThrow('pass failed');

        expect(scene.children).toEqual(sheets.map((sheet) => sheet.flags.mesh));
        for (const sheet of sheets) {
            expect(sheet.flags.mesh.visible).toBe(true);
            expect(sheet.flags.material.uniforms.opacity.value).toBe(BAR_OPACITY);
        }
        // What was built before the throw is freed.
        expect(composers().at(-1)!.dispose).toHaveBeenCalled();
    });

    it('builds twice the columns over the same footprint, with a single dust draw of the configured count', () => {
        const { scene } = setup();
        const dense = scene.children.filter(
            (child): child is THREE.Mesh =>
                child instanceof THREE.Mesh && child.geometry instanceof THREE.InstancedBufferGeometry,
        );
        // Standard and dense meshes
        const counts = dense.map((mesh) => (mesh.geometry as THREE.InstancedBufferGeometry).instanceCount);
        expect(counts.filter((count) => count === DENSE_COLUMNS * FLAG_DEPTH)).toHaveLength(3);
        expect(DENSE_COLUMNS).toBe((FLAG_WIDTH - 1) * 2 + 1);
        const points = scene.children.filter((child): child is THREE.Points => child instanceof THREE.Points);
        expect(points).toHaveLength(1);
        expect(points[0].geometry.getAttribute('position').count).toBe(DUST_COUNT);
    });

    it('sizes the bloom at the configured share of the drawing size in device pixels', () => {
        const { look } = setup(true, 2);
        // The real pass copies the resolution it is given, so only what the look hands to setSize is checked. It is
        // twice the target because the pass's first target is half of what it gets.
        expect(bloom().sizes.at(-1)).toEqual([
            Math.round(800 * 2 * BLOOM_RESOLUTION_SHARE) * 2,
            Math.round(600 * 2 * BLOOM_RESOLUTION_SHARE) * 2,
        ]);
        look.setSize({ width: 1000, height: 500 });
        expect(composer().size).toEqual([1000, 500]);
        expect(bloom().sizes.at(-1)).toEqual([
            Math.round(1000 * 2 * BLOOM_RESOLUTION_SHARE) * 2,
            Math.round(500 * 2 * BLOOM_RESOLUTION_SHARE) * 2,
        ]);
    });
});

describe('setMix', () => {
    it('fades the standard meshes through their opacity while mix < 1, hides them at 1, and restores them', () => {
        const { look, sheets } = setup();

        look.setMix(0.25);
        for (const sheet of sheets) {
            expect(sheet.flags.mesh.visible).toBe(true);
            expect(sheet.flags.material.uniforms.opacity.value).toBeCloseTo(BAR_OPACITY * 0.75, 10);
        }

        look.setMix(1);
        for (const sheet of sheets) expect(sheet.flags.mesh.visible).toBe(false);

        look.setMix(0);
        for (const sheet of sheets) {
            expect(sheet.flags.mesh.visible).toBe(true);
            expect(sheet.flags.material.uniforms.opacity.value).toBe(BAR_OPACITY);
        }
    });

    it('clamps the mix and ignores NaN', () => {
        const { look, sheets } = setup();
        look.setMix(7);
        expect(sheets[0].flags.mesh.visible).toBe(false);
        look.setMix(-3);
        expect(sheets[0].flags.mesh.visible).toBe(true);
        expect(sheets[0].flags.material.uniforms.opacity.value).toBe(BAR_OPACITY);
        look.setMix(0.5);
        look.setMix(NaN);
        expect(sheets[0].flags.material.uniforms.opacity.value).toBeCloseTo(BAR_OPACITY * 0.5, 10);
    });

    it('shows the dense bars only once the mix is above 0, and scales their opacity by it', () => {
        const s = setup();
        const denseMeshes = s.scene.children.filter(
            (child): child is THREE.Mesh =>
                child instanceof THREE.Mesh &&
                !s.standardMeshes.includes(child) &&
                child.geometry instanceof THREE.InstancedBufferGeometry,
        );
        expect(denseMeshes).toHaveLength(3);
        expect(denseMeshes.every((mesh) => !mesh.visible)).toBe(true);
        s.look.setMix(0.4);
        for (const mesh of denseMeshes) {
            expect(mesh.visible).toBe(true);
            expect((mesh.material as THREE.RawShaderMaterial).uniforms.mixOpacity.value).toBeCloseTo(0.4, 10);
        }
    });
});

describe('render', () => {
    it('interpolates the standard heights into the dense bars, same rows, and follows the position', () => {
        const s = setup();
        const source = s.sheets[2].flags;
        // Column 10 = 100, column 11 = 300 (row 3 only); everything else 0.
        source.setFlagHeight(10, 3, 100);
        source.setFlagHeight(11, 3, 300);
        source.mesh.position.set(12, -34, -56);
        s.look.setMix(1);
        s.look.render(1 / 60);

        const dense = s.scene.children.filter(
            (child): child is THREE.Mesh =>
                child instanceof THREE.Mesh &&
                !s.standardMeshes.includes(child) &&
                child.geometry instanceof THREE.InstancedBufferGeometry,
        );
        // Meshes are added in sheet order, so the last one belongs to the bass sheet.
        const mesh = dense[2];
        const array = (mesh.geometry as THREE.InstancedBufferGeometry).getAttribute('instanceHeight').array;
        expect(array[20 * FLAG_DEPTH + 3]).toBe(100);
        expect(array[21 * FLAG_DEPTH + 3]).toBe(200);
        expect(array[22 * FLAG_DEPTH + 3]).toBe(300);
        expect(array[21 * FLAG_DEPTH + 4]).toBe(0);
        expect(array[(DENSE_COLUMNS - 1) * FLAG_DEPTH + 3]).toBe(0);
        expect(mesh.position.toArray()).toEqual([12, -34, -56]);
        expect(
            (mesh.geometry.getAttribute('instanceHeight') as THREE.InstancedBufferAttribute).version,
        ).toBeGreaterThan(0);
    });

    it('packs the columns closer but keeps the standard row spacing, so the sheet is as deep', () => {
        const s = setup();
        const offsetsOf = (mesh: THREE.Mesh) =>
            (mesh.geometry as THREE.InstancedBufferGeometry).getAttribute('instanceOffset');
        const standard = offsetsOf(s.standardMeshes[0] as THREE.Mesh);
        const dense = offsetsOf(
            s.scene.children.filter(
                (child): child is THREE.Mesh =>
                    child instanceof THREE.Mesh &&
                    !s.standardMeshes.includes(child) &&
                    child.geometry instanceof THREE.InstancedBufferGeometry,
            )[0],
        );
        const lastRow = FLAG_DEPTH - 1;
        expect(dense.getZ(lastRow)).toBe(standard.getZ(lastRow));
        expect(dense.getX(FLAG_DEPTH)).toBeCloseTo(standard.getX(FLAG_DEPTH) / 2, 6);
    });

    it('copies the standard colors, interpolating the in-between bars', () => {
        const s = setup();
        const standard = s.sheets[0].flags.geometry.getAttribute('instanceColor').array;
        const dense = s.scene.children.filter(
            (child): child is THREE.Mesh =>
                child instanceof THREE.Mesh &&
                !s.standardMeshes.includes(child) &&
                child.geometry instanceof THREE.InstancedBufferGeometry,
        )[0];
        const colors = (dense.geometry as THREE.InstancedBufferGeometry).getAttribute('instanceColor').array;
        const row = 2;
        expect(colors[40 * FLAG_DEPTH * 3 + row * 3]).toBeCloseTo(standard[20 * FLAG_DEPTH * 3 + row * 3], 6);
        expect(colors[41 * FLAG_DEPTH * 3 + row * 3 + 1]).toBeCloseTo(
            (standard[20 * FLAG_DEPTH * 3 + row * 3 + 1] + standard[21 * FLAG_DEPTH * 3 + row * 3 + 1]) / 2,
            6,
        );
    });

    it('draws through the composer once per frame and not through the renderer', () => {
        const s = setup();
        s.look.render(1 / 60);
        s.look.render(1 / 60);
        expect(composer().render).toHaveBeenCalledTimes(2);
    });

    it('sets the bloom from Glow times mix, and turns it off at Glow 0', () => {
        const s = setup();
        s.look.setMix(1);
        s.values.current.glowStrength = 2;
        s.look.render(1 / 60);
        expect(bloom().enabled).toBe(true);
        expect(bloom().strength).toBeCloseTo(2 * 0.45, 10);
        expect(bloom().radius).toBeGreaterThan(0);

        s.look.setMix(0.5);
        s.look.render(1 / 60);
        expect(bloom().strength).toBeCloseTo(0.45, 10);

        s.values.current.glowStrength = 0;
        s.look.render(1 / 60);
        expect(bloom().enabled).toBe(false);
    });

    it('turns the bloom off on a canvas too small for its mip chain and back on when it grows', () => {
        const s = setup(true, 2);
        s.look.setSize({ width: 15, height: 600 });
        s.look.render(1 / 60);
        expect(bloom().enabled).toBe(false);
        s.look.setSize({ width: 800, height: 15 });
        s.look.render(1 / 60);
        expect(bloom().enabled).toBe(false);
        s.look.setSize({ width: 16, height: 16 });
        s.look.render(1 / 60);
        expect(bloom().enabled).toBe(true);
    });

    it('hazes the sheets further back more, and not at all at Depth 0', () => {
        const s = setup();
        const uniformsOf = () =>
            s.scene.children
                .filter(
                    (child): child is THREE.Mesh =>
                        child instanceof THREE.Mesh &&
                        !s.standardMeshes.includes(child) &&
                        child.geometry instanceof THREE.InstancedBufferGeometry,
                )
                .map((mesh) => (mesh.material as THREE.RawShaderMaterial).uniforms);
        s.look.render(1 / 60);
        expect(uniformsOf().map((u) => u.haze.value)).toEqual([0, HAZE_MAX / 2, HAZE_MAX]);
        s.values.current.depth = 0;
        s.look.render(1 / 60);
        expect(uniformsOf().map((u) => u.haze.value)).toEqual([0, 0, 0]);
        // Emissive gain follows Glow.
        s.values.current.glowStrength = 0;
        s.look.render(1 / 60);
        expect(uniformsOf()[0].emissiveGain.value).toBe(1);
    });

    it('survives a bad frame time and clamps a long one', () => {
        const s = setup();
        expect(() => s.look.render(NaN)).not.toThrow();
        expect(() => s.look.render(-1)).not.toThrow();
        expect(() => s.look.render(60)).not.toThrow();
    });

    it('does not allocate a new GPU object or object in the scene across frames', () => {
        const s = setup();
        s.look.setMix(1);
        const before = s.scene.children.length;
        for (let i = 0; i < 30; i++) {
            beat(s, i, 0.4);
            s.look.render(0.016);
        }
        expect(s.scene.children).toHaveLength(before);
        expect(composers()).toHaveLength(1);
        expect(blooms()).toHaveLength(1);
    });
});

const uniformsOf = (ring: THREE.Mesh) => (ring.material as THREE.ShaderMaterial).uniforms as RingUniforms;

describe('accent and shockwave', () => {
    const rings = (s: Setup) =>
        s.scene.children.filter(
            (child): child is THREE.Mesh => child instanceof THREE.Mesh && child.name === SHOCKWAVE_RING_NAME,
        );

    it('reads the rhythm each frame, fires a ring and a pulse on a new beat, and decays the pulse', () => {
        const s = setup();
        s.look.setMix(1);
        s.look.render(1 / 60);
        expect(s.rhythm.updatePhase).toHaveBeenCalledTimes(1);
        expect(rings(s).every((ring) => !ring.visible)).toBe(true);

        beat(s, 1);
        expect(rings(s).filter((ring) => ring.visible)).toHaveLength(1);
        expect(bloom().strength).toBeGreaterThan(0.45);
        const ring = rings(s).find((candidate) => candidate.visible)!;
        expect(uniformsOf(ring).outerColor.value.x).toBeGreaterThan(1);
        expect(uniformsOf(ring).strength.value).toBeGreaterThan(0);

        const first = uniformsOf(ring).progress.value;
        s.look.render(0.2);
        expect(uniformsOf(ring).progress.value).toBeGreaterThan(first);
        // Past its lifetime it is hidden again.
        s.look.render(0.1);
        s.look.render(0.1);
        for (let i = 0; i < 12; i++) s.look.render(0.1);
        expect(ring.visible).toBe(false);
    });

    it('draws the rings behind the sheets, after the backdrop and before the bars', () => {
        const s = setup();
        const farthest = s.standardMeshes[s.standardMeshes.length - 1].position.z;
        for (const ring of rings(s)) {
            expect(ring.position.z).toBeLessThan(farthest);
            expect(ring.renderOrder).toBeLessThan(0);
            expect(ring.renderOrder).toBeGreaterThan(-10);
        }
    });

    it('makes a downbeat burst bigger and brighter, followed by an echo ring', () => {
        const s = setup();
        s.look.setMix(1);
        s.look.render(1 / 60);
        beat(s, 1);
        const plain = rings(s).find((candidate) => candidate.visible)!;
        const plainScale = plain.scale.x;
        const plainStrength = uniformsOf(plain).strength.value;
        for (let i = 0; i < 15; i++) s.look.render(0.1);
        expect(rings(s).every((ring) => !ring.visible)).toBe(true);

        s.rhythm.state.downbeatCount = 1;
        beat(s, 2);
        const live = rings(s).filter((ring) => ring.visible);
        expect(live).toHaveLength(1);
        expect(live[0].scale.x).toBeGreaterThan(plainScale);
        expect(uniformsOf(live[0]).strength.value).toBeGreaterThan(plainStrength);
        // The echo starts after its delay.
        s.look.render(0.1);
        s.look.render(0.1);
        const both = rings(s).filter((ring) => ring.visible);
        expect(both).toHaveLength(2);
        expect(uniformsOf(both[1]).strength.value).toBeLessThan(uniformsOf(both[0]).strength.value);
    });

    it('fires from a rising kick onset and reuses the pool, never showing more rings than the pool holds', () => {
        const s = setup();
        s.look.setMix(1);
        s.look.render(1 / 60);
        for (let i = 0; i < 8; i++) {
            s.rhythm.state.bandOnsets[0] = 0;
            s.look.render(0.01);
            s.rhythm.state.bandOnsets[0] = 0.9;
            s.look.render(0.35);
        }
        const visible = rings(s).filter((ring) => ring.visible);
        expect(visible.length).toBeGreaterThan(0);
        expect(visible.length).toBeLessThanOrEqual(SHOCKWAVE_POOL_SIZE);
    });

    it('scales the ring by the Beat accent and shows no ring at 0', () => {
        const s = setup();
        s.look.setMix(1);
        s.look.render(1 / 60);
        s.values.current.accentIntensity = 0;
        beat(s, 1);
        const ring = rings(s).find((candidate) => candidate.visible)!;
        expect(uniformsOf(ring).strength.value).toBe(0);
        expect(bloom().strength).toBeCloseTo(0.45, 10);
    });

    it('never triggers without a rhythm tracker', () => {
        const s = setup(false);
        s.look.setMix(1);
        for (let i = 0; i < 20; i++) s.look.render(0.4);
        expect(rings(s).every((ring) => !ring.visible)).toBe(true);
        expect(bloom().strength).toBeCloseTo(0.45, 10);
    });

    it('reads a missing kick onset as 0', () => {
        const s = setup();
        s.rhythm.state.bandOnsets = [];
        s.look.render(0.1);
        s.look.render(0.1);
        expect(rings(s).every((ring) => !ring.visible)).toBe(true);
    });

    it('fires no ring under reduced motion, damps the pulse, and holds the dust still', () => {
        const s = setup();
        s.look.setMix(1);
        s.look.render(1 / 60);
        const pulseOf = () =>
            (
                s.scene.children.find(
                    (child) =>
                        child instanceof THREE.Mesh &&
                        !s.standardMeshes.includes(child) &&
                        child.geometry instanceof THREE.InstancedBufferGeometry,
                ) as THREE.Mesh
            ).material as THREE.RawShaderMaterial;
        const dust = s.scene.children.find((child) => child instanceof THREE.Points) as THREE.Points;
        const dustMaterial = dust.material as THREE.ShaderMaterial;

        beat(s, 1);
        const normalPulse = pulseOf().uniforms.pulse.value as number;
        expect(normalPulse).toBeCloseTo(ACCENT_PEAK_CAP, 6);
        const driftBefore = dustMaterial.uniforms.uTime.value as number;
        s.look.render(1);
        expect(dustMaterial.uniforms.uTime.value).toBeGreaterThan(driftBefore);

        // Reduced motion applies at once: live rings go, the pulse is clamped to its damped peak, the dust stops.
        s.reduced.matches = true;
        const frozen = dustMaterial.uniforms.uTime.value as number;
        s.look.render(0.01);
        expect(rings(s).every((ring) => !ring.visible)).toBe(true);
        expect(pulseOf().uniforms.pulse.value as number).toBeLessThanOrEqual(
            ACCENT_PEAK_CAP * ACCENT_REDUCED_MOTION_FACTOR,
        );
        s.look.render(1);
        expect(dustMaterial.uniforms.uTime.value).toBe(frozen);

        for (let i = 0; i < 4; i++) s.look.render(0.1);
        beat(s, 2, 0.1);
        expect(rings(s).every((ring) => !ring.visible)).toBe(true);
        expect(pulseOf().uniforms.pulse.value as number).toBeCloseTo(ACCENT_PEAK_CAP * ACCENT_REDUCED_MOTION_FACTOR, 6);
    });

    it('scales dust and the backdrop with their sliders and the mix', () => {
        const s = setup();
        const dust = s.scene.children.find((child) => child instanceof THREE.Points) as THREE.Points;
        const backdrop = s.scene.children.find(
            (child) => child instanceof THREE.Mesh && child.geometry instanceof THREE.PlaneGeometry,
        ) as THREE.Mesh;
        s.look.render(0.1);
        expect(dust.visible).toBe(false);
        expect(backdrop.visible).toBe(false);

        s.look.setMix(1);
        s.look.render(0.1);
        expect(dust.visible).toBe(true);
        expect(backdrop.visible).toBe(true);
        expect(backdrop.renderOrder).toBeLessThan(0);
        // The plane sits behind the last (farthest) sheet.
        expect(backdrop.position.z).toBeLessThan(s.sheets[2].flags.mesh.position.z);

        s.values.current.dust = 0;
        s.values.current.depth = 0;
        s.look.render(0.1);
        expect(dust.visible).toBe(false);
        expect(backdrop.visible).toBe(false);
    });

    it('follows a pixel ratio change on resize', () => {
        const s = setup(true, 2);
        const dust = s.scene.children.find((child) => child instanceof THREE.Points) as THREE.Points;
        const material = dust.material as THREE.ShaderMaterial;
        expect(material.uniforms.uPixelSize.value).toBeCloseTo(2.5 * 2, 10);
        s.look.setSize({ width: 400, height: 300 });
        expect(material.uniforms.uPixelSize.value).toBeCloseTo(2.5 * 2, 10);
    });
});

describe('dispose', () => {
    it('removes everything it added, restores the standard meshes and frees every resource it created', () => {
        const s = setup();
        s.look.setMix(1);
        const standardSet = new Set<THREE.Object3D>(s.standardMeshes);
        const own = s.scene.children.filter((child) => !standardSet.has(child)) as THREE.Mesh[];
        const geometries = new Set<THREE.BufferGeometry>();
        const materials = new Set<THREE.Material>();
        for (const object of own) {
            geometries.add(object.geometry);
            materials.add(object.material as THREE.Material);
        }
        const geometrySpies = [...geometries].map((geometry) => vi.spyOn(geometry, 'dispose'));
        const materialSpies = [...materials].map((material) => vi.spyOn(material, 'dispose'));
        const passes = [...composer().passes];
        // 3 dense + backdrop + dust + one shared ring geometry
        expect(geometries.size).toBe(3 + 1 + 1 + 1);

        s.look.dispose();

        expect(s.scene.children).toEqual(s.standardMeshes);
        for (const spy of [...geometrySpies, ...materialSpies]) expect(spy).toHaveBeenCalledTimes(1);
        for (const pass of passes) expect(pass.dispose).toHaveBeenCalledTimes(1);
        expect(composer().dispose).toHaveBeenCalledTimes(1);
        for (const sheet of s.sheets) {
            expect(sheet.flags.mesh.visible).toBe(true);
            expect(sheet.flags.material.uniforms.opacity.value).toBe(BAR_OPACITY);
        }
    });

    it('restores the standard meshes mid-crossfade too, and a mesh that was already hidden stays hidden', () => {
        const s = setup();
        s.look.setMix(0.5);
        s.look.dispose();
        expect(s.sheets[0].flags.material.uniforms.opacity.value).toBe(BAR_OPACITY);

        const sheets = BANDS.map((band, index) => new TrioColorWaveSheet(band, index, BANDS.length));
        sheets[1].flags.mesh.visible = false;
        const look = createTrioEnhancedLook({
            renderer: { getPixelRatio: () => 1 } as unknown as THREE.WebGLRenderer,
            scene: new THREE.Scene(),
            camera: new THREE.PerspectiveCamera(),
            sheets: sheets.map((sheet) => sheet.flags),
            size: { width: 100, height: 100 },
            valuesRef: { current: { glowStrength: 1, accentIntensity: 1, depth: 1, dust: 1 } as TrioLookControlValues },
            rhythm: undefined,
            reducedMotion: { matches: false },
        });
        look.setMix(0.5);
        expect(sheets[1].flags.mesh.visible).toBe(false);
        look.dispose();
        expect(sheets[1].flags.mesh.visible).toBe(false);
        expect(sheets[0].flags.mesh.visible).toBe(true);
    });

    it('is idempotent, and render, setSize and setMix do nothing afterwards', () => {
        const s = setup();
        s.look.dispose();
        const renders = composer().render.mock.calls.length;
        const sizeCalls = (composer() as unknown as { size: [number, number] }).size;

        s.look.dispose();
        s.look.render(0.1);
        s.look.setSize({ width: 10, height: 10 });
        s.look.setMix(1);

        expect(composer().dispose).toHaveBeenCalledTimes(1);
        expect(composer().render.mock.calls).toHaveLength(renders);
        expect(composer().size).toBe(sizeCalls);
        expect(s.sheets[0].flags.mesh.visible).toBe(true);
        expect(s.rhythm.updatePhase).not.toHaveBeenCalled();
    });

    it('leaves only the standard meshes after five create and dispose cycles, each freeing what it made', () => {
        const geometryDispose = vi.spyOn(THREE.BufferGeometry.prototype, 'dispose');
        const materialDispose = vi.spyOn(THREE.Material.prototype, 'dispose');
        try {
            const renderer = { getPixelRatio: () => 1 } as unknown as THREE.WebGLRenderer;
            const scene = new THREE.Scene();
            const sheets = BANDS.map((band, index) => new TrioColorWaveSheet(band, index, BANDS.length));
            sheets.forEach((sheet) => scene.add(sheet.flags.mesh));
            for (let cycle = 0; cycle < 5; cycle++) {
                geometryDispose.mockClear();
                materialDispose.mockClear();
                const look = createTrioEnhancedLook({
                    renderer,
                    scene,
                    camera: new THREE.PerspectiveCamera(),
                    sheets: sheets.map((sheet) => sheet.flags),
                    size: { width: 100, height: 100 },
                    valuesRef: {
                        current: { glowStrength: 1, accentIntensity: 1, depth: 1, dust: 1 } as TrioLookControlValues,
                    },
                    rhythm: undefined,
                    reducedMotion: { matches: false },
                });
                look.setMix(1);
                look.render(0.016);
                // While the look is live the standard bars draw with its pass-through material.
                for (const sheet of sheets) expect(sheet.flags.mesh.material).not.toBe(sheet.flags.material);
                look.dispose();
                for (const sheet of sheets) expect(sheet.flags.mesh.material).toBe(sheet.flags.material);
                // 3 dense + backdrop + dust + ring geometry; 3 dense + backdrop + dust + the ring materials + the 3
                // standard pass-through materials.
                expect(geometryDispose).toHaveBeenCalledTimes(6);
                expect(materialDispose).toHaveBeenCalledTimes(5 + SHOCKWAVE_POOL_SIZE + 3);
                expect(scene.children).toHaveLength(3);
            }
        } finally {
            geometryDispose.mockRestore();
            materialDispose.mockRestore();
        }
    });
});

describe('no sheets', () => {
    it('still builds, renders and disposes', () => {
        const renderer = { getPixelRatio: () => 1 } as unknown as THREE.WebGLRenderer;
        const scene = new THREE.Scene();
        const look = createTrioEnhancedLook({
            renderer,
            scene,
            camera: new THREE.PerspectiveCamera(),
            sheets: [],
            size: { width: 100, height: 100 },
            valuesRef: { current: { glowStrength: 1, accentIntensity: 1, depth: 1, dust: 1 } as TrioLookControlValues },
            rhythm: undefined,
            reducedMotion: { matches: false },
        });
        look.setMix(1);
        look.render(0.016);
        look.dispose();
        expect(scene.children).toHaveLength(0);
    });
});
