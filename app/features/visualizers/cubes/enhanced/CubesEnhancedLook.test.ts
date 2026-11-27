import * as THREE from 'three';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CubesEnhancedLook } from './CubesEnhancedLook';
import { cubesEnhancedConfig } from './cubesEnhancedConfig';
import type { CubeGridLike, CubesEnhancedSettings, CubesFxFrame } from './cubesEnhancedTypes';

// The passes run shaders, so they are replaced by recorders of what the look does to them. vi.mock is hoisted, hence the
// hoisted record the factories write to.
const rec = vi.hoisted(() => {
    class Pass {
        enabled = true;
        dispose = vi.fn();
        sizes: [number, number][] = [];
        setSize(width: number, height: number) {
            this.sizes.push([width, height]);
        }
    }
    return { Pass, composers: [] as unknown[], blooms: [] as unknown[], outputs: [] as unknown[] };
});

vi.mock('three/addons/postprocessing/EffectComposer.js', () => ({
    EffectComposer: class {
        passes: InstanceType<typeof rec.Pass>[] = [];
        size: [number, number] | undefined;
        render = vi.fn();
        dispose = vi.fn();
        setSize = vi.fn((width: number, height: number) => {
            this.size = [width, height];
        });
        addPass = vi.fn((pass: InstanceType<typeof rec.Pass>) => {
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
        }
    },
}));
vi.mock('three/addons/postprocessing/OutputPass.js', () => ({
    OutputPass: class extends rec.Pass {
        constructor() {
            super();
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

type Composer = {
    passes: InstanceType<typeof rec.Pass>[];
    size: [number, number] | undefined;
    render: ReturnType<typeof vi.fn>;
    dispose: ReturnType<typeof vi.fn>;
};
type Bloom = InstanceType<typeof rec.Pass> & { resolution: { x: number; y: number }; strength: number };

const composers = () => rec.composers as Composer[];
const blooms = () => rec.blooms as Bloom[];
const config = cubesEnhancedConfig as { cubeMaterial: string };

function fakeGrid(columns = 4, rows = 3) {
    const geometry = new THREE.BoxGeometry(1, 1, 1);
    const material = new THREE.MeshBasicMaterial();
    const mesh = new THREE.InstancedMesh(geometry, material, columns * rows);
    const setMaterialOverride = vi.fn();
    const grid: CubeGridLike = { mesh, columns, rows, setMaterialOverride };
    return { grid, mesh, setMaterialOverride };
}

function frame(overrides: Partial<CubesFxFrame> = {}): CubesFxFrame {
    return { bands: null, bassFlash: 0, beatPhase: null, barPhase: null, barLocked: false, dt: 1 / 60, ...overrides };
}

function settings(overrides: Partial<CubesEnhancedSettings> = {}): CubesEnhancedSettings {
    return {
        glow: 1,
        particles: 1,
        cameraMotion: 1,
        restingColor: new THREE.Color(0x224466),
        raisedColor: new THREE.Color(0xff8844),
        ...overrides,
    };
}

function setup(reducedMotion = false, pixelRatio = 2, size = { width: 800, height: 600 }) {
    const renderer = {
        getPixelRatio: () => pixelRatio,
        toneMapping: THREE.LinearToneMapping as THREE.ToneMapping,
        toneMappingExposure: 0.7,
        render: vi.fn(),
    } as unknown as THREE.WebGLRenderer;
    const background = new THREE.Color(0x101010);
    const scene = new THREE.Scene();
    scene.background = background;
    const fog = new THREE.Fog(0x123456, 5, 50);
    scene.fog = fog;
    scene.environmentIntensity = 0.3;
    const camera = new THREE.PerspectiveCamera(50, 4 / 3, 1, 500);
    camera.position.set(0, 0, 32);
    const lights = {
        key: new THREE.DirectionalLight(0xffffff, 25),
        fill: new THREE.DirectionalLight(0xaab4ff, 8),
        ambient: new THREE.AmbientLight(0xffffff, 4),
    };
    scene.add(lights.key, lights.fill, lights.ambient);
    const look = new CubesEnhancedLook({ renderer, scene, camera, lights, size, reducedMotion });
    return { look, renderer, scene, camera, lights, background, fog };
}

function sceneRootGroup(scene: THREE.Scene): THREE.Group {
    return scene.children.find((child) => child instanceof THREE.Group) as THREE.Group;
}

describe('CubesEnhancedLook', () => {
    beforeEach(() => {
        rec.composers.length = 0;
        rec.blooms.length = 0;
        rec.outputs.length = 0;
    });

    describe('color pipeline and saved state', () => {
        it('changes the scene and then puts every property back exactly on dispose', () => {
            const { look, renderer, scene, lights, background, fog: originalFog } = setup();
            expect(scene.background).not.toBe(background);
            expect(scene.fog).not.toBe(originalFog);
            expect(renderer.toneMapping).toBe(THREE.NoToneMapping);
            expect(renderer.toneMappingExposure).toBe(cubesEnhancedConfig.exposure);
            expect(lights.fill.color.getHex()).toBe(cubesEnhancedConfig.lights.fillColor);

            look.dispose();

            expect(scene.background).toBe(background);
            expect(background.getHex()).toBe(0x101010);
            expect(scene.fog).toBe(originalFog);
            expect(scene.environmentIntensity).toBe(0.3);
            expect(renderer.toneMapping).toBe(THREE.LinearToneMapping);
            expect(renderer.toneMappingExposure).toBe(0.7);
            expect(lights.key.intensity).toBe(25);
            expect(lights.fill.intensity).toBe(8);
            expect(lights.ambient.intensity).toBe(4);
            expect(lights.key.color.getHex()).toBe(0xffffff);
            expect(lights.fill.color.getHex()).toBe(0xaab4ff);
            expect(lights.ambient.color.getHex()).toBe(0xffffff);
        });

        it('scales the lights and environment by the configured factors', () => {
            const { look, scene, lights } = setup();
            const { lights: scales } = cubesEnhancedConfig;
            expect(lights.key.intensity).toBe(25 * scales.keyScale);
            expect(lights.fill.intensity).toBe(8 * scales.fillScale);
            expect(lights.ambient.intensity).toBe(4 * scales.ambientScale);
            expect(scene.environmentIntensity).toBeCloseTo(0.3 * scales.environmentScale);
            expect(scene.fog).toBeInstanceOf(THREE.FogExp2);
            look.dispose();
        });

        it('uses ACES tone mapping when configured', () => {
            const mutable = cubesEnhancedConfig as { toneMapping: string };
            mutable.toneMapping = 'aces';
            try {
                const { look, renderer } = setup();
                expect(renderer.toneMapping).toBe(THREE.ACESFilmicToneMapping);
                look.dispose();
            } finally {
                mutable.toneMapping = 'none';
            }
        });

        it('puts all its objects under one scene-root group', () => {
            const { look, scene } = setup();
            const group = sceneRootGroup(scene);
            expect(group).toBeDefined();
            // The backdrop and the particles.
            expect(group.children).toHaveLength(2);
            look.dispose();
            expect(scene.children.includes(group)).toBe(false);
        });
    });

    describe('post stack', () => {
        it('builds a composer with render, half-resolution bloom and output passes on construction', () => {
            const { look } = setup();
            expect(composers()).toHaveLength(1);
            const composer = composers()[0];
            expect(composer.passes).toHaveLength(3);
            // 800x600 at pixel ratio 2, half resolution; the bloom is given twice that.
            expect(blooms()[0].resolution.x).toBe(800);
            expect(blooms()[0].resolution.y).toBe(600);
            expect(blooms()[0].sizes.at(-1)).toEqual([1600, 1200]);
            expect(composer.size).toEqual([800, 600]);
            look.render();
            expect(composer.render).toHaveBeenCalledTimes(1);
            look.dispose();
        });

        it('sets bloom strength from the drive, Glow and the configured maximum', () => {
            const { look } = setup();
            look.update(frame({ bassFlash: 1 }), settings({ glow: 0.5 }));
            const half = blooms()[0].strength;
            expect(half).toBeGreaterThan(0);
            expect(blooms()[0].enabled).toBe(true);
            look.update(frame({ bassFlash: 1 }), settings({ glow: 1 }));
            expect(blooms()[0].strength).toBeCloseTo(half * 2);
            expect(blooms()[0].strength).toBeLessThanOrEqual(cubesEnhancedConfig.post.bloomStrengthMax);
            look.update(frame(), settings({ glow: 0 }));
            expect(blooms()[0].strength).toBe(0);
            expect(blooms()[0].enabled).toBe(false);
            look.dispose();
        });

        it('resizes the composer and bloom, and turns the bloom off below the minimum size', () => {
            const { look } = setup();
            look.update(frame(), settings());
            look.resize(400, 300);
            const composer = composers()[0];
            expect(composer.size).toEqual([400, 300]);
            expect(blooms()[0].sizes.at(-1)).toEqual([800, 600]);
            expect(blooms()[0].enabled).toBe(true);
            look.resize(10, 10);
            expect(blooms()[0].enabled).toBe(false);
            look.update(frame(), settings());
            expect(blooms()[0].enabled).toBe(false);
            look.resize(400, 300);
            look.update(frame(), settings());
            expect(blooms()[0].enabled).toBe(true);
            look.dispose();
        });
    });

    describe('attach', () => {
        it('moves the grid mesh into the group and applies one material override', () => {
            const { look, scene } = setup();
            const { grid, mesh, setMaterialOverride } = fakeGrid();
            scene.add(mesh);
            look.attach(grid);
            expect(mesh.parent).toBe(sceneRootGroup(scene));
            expect(scene.children.includes(mesh)).toBe(false);
            expect(setMaterialOverride).toHaveBeenCalledTimes(1);
            const material = setMaterialOverride.mock.calls[0][0] as THREE.MeshPhysicalMaterial;
            expect(material).toBeInstanceOf(THREE.MeshPhysicalMaterial);
            expect(material.transparent).toBe(true);
            expect(material.opacity).toBe(cubesEnhancedConfig.material.glass.opacity);
            expect(material.customProgramCacheKey()).toBe('cubes-enhanced-fx-v1');
            look.dispose();
        });

        it('patches the material shader through onBeforeCompile with the look uniforms', () => {
            const { look } = setup();
            const { grid, setMaterialOverride } = fakeGrid();
            look.attach(grid);
            const material = setMaterialOverride.mock.calls[0][0] as THREE.MeshPhysicalMaterial;
            const shader = {
                uniforms: {} as Record<string, unknown>,
                vertexShader: THREE.ShaderLib.physical.vertexShader,
                fragmentShader: THREE.ShaderLib.physical.fragmentShader,
            };
            material.onBeforeCompile(shader as unknown as THREE.WebGLProgramParametersWithUniforms, {} as never);
            expect(shader.uniforms.fxShatter).toBeDefined();
            expect(shader.vertexShader).toContain('fxOffset');
            look.update(frame({ beatPhase: 0.25 }), settings());
            expect((shader.uniforms.fxWaveAmplitude as { value: number }).value).toBeGreaterThan(0);
            look.dispose();
        });

        it('re-attaches to a new grid after the old one was disposed by the hook', () => {
            const { look, scene } = setup();
            const first = fakeGrid();
            look.attach(first.grid);
            // What CubeGrid.dispose does to its mesh.
            first.mesh.removeFromParent();
            const second = fakeGrid(6, 5);
            scene.add(second.mesh);
            look.attach(second.grid);
            expect(second.mesh.parent).toBe(sceneRootGroup(scene));
            expect(second.setMaterialOverride).toHaveBeenCalledTimes(1);
            expect(first.mesh.parent).toBeNull();
            look.dispose();
            expect(second.setMaterialOverride).toHaveBeenLastCalledWith(null);
            expect(second.mesh.parent).toBe(scene);
        });

        it('releases a still-alive old grid when a new one is attached', () => {
            const { look, scene } = setup();
            const first = fakeGrid();
            const second = fakeGrid();
            look.attach(first.grid);
            look.attach(second.grid);
            expect(first.mesh.parent).toBeNull();
            expect(first.setMaterialOverride).toHaveBeenLastCalledWith(null);
            look.attach(second.grid);
            expect(second.mesh.parent).toBe(sceneRootGroup(scene));
            look.dispose();
        });

        it('gives the opaque emissive material when configured', () => {
            config.cubeMaterial = 'opaqueEmissive';
            try {
                const { look } = setup();
                const { grid, setMaterialOverride } = fakeGrid();
                look.attach(grid);
                const material = setMaterialOverride.mock.calls[0][0] as THREE.MeshPhysicalMaterial;
                expect(material.transparent).toBe(false);
                expect(material.depthWrite).toBe(true);
                expect(material.side).toBe(THREE.FrontSide);
                look.dispose();
            } finally {
                config.cubeMaterial = 'glass';
            }
        });
    });

    describe('particles', () => {
        function particles(scene: THREE.Scene): THREE.Points {
            return sceneRootGroup(scene).children.find((child) => child instanceof THREE.Points) as THREE.Points;
        }

        it('scales the drawn count with the Particles setting without reallocating, and hides at 0', () => {
            const { look, scene } = setup();
            const points = particles(scene);
            const positions = points.geometry.getAttribute('position');
            const count = cubesEnhancedConfig.particles.count;
            expect(positions.count).toBe(count);

            look.update(frame(), settings({ particles: 1 }));
            expect(points.geometry.drawRange.count).toBe(count);
            expect(points.visible).toBe(true);
            look.update(frame(), settings({ particles: 0.5 }));
            expect(points.geometry.drawRange.count).toBe(Math.round(count * 0.5));
            look.update(frame(), settings({ particles: 0 }));
            expect(points.geometry.drawRange.count).toBe(0);
            expect(points.visible).toBe(false);
            look.update(frame(), settings({ particles: 1 }));
            expect(points.geometry.getAttribute('position')).toBe(positions);
            expect(points.material).toBeInstanceOf(THREE.ShaderMaterial);
            expect((points.material as THREE.ShaderMaterial).blending).toBe(THREE.AdditiveBlending);
            expect((points.material as THREE.ShaderMaterial).depthWrite).toBe(false);
            look.dispose();
        });

        it('follows the colors and the emit level, and scales its point size with the pixel ratio', () => {
            const { look, scene } = setup(false, 2);
            const material = particles(scene).material as THREE.ShaderMaterial;
            expect(material.uniforms.uPointScale.value).toBe(2 * cubesEnhancedConfig.particles.size);
            look.update(frame({ bassFlash: 1 }), settings());
            expect((material.uniforms.uColorB.value as THREE.Color).getHex()).toBe(new THREE.Color(0xff8844).getHex());
            expect(material.uniforms.uBass.value).toBe(1);
            look.dispose();
        });
    });

    describe('backdrop', () => {
        it('tints from the resting color and lights up with the bass, replacing the basic flash', () => {
            const { look, scene } = setup();
            const backdrop = sceneRootGroup(scene).children.find((child) => child instanceof THREE.Mesh) as THREE.Mesh<
                THREE.PlaneGeometry,
                THREE.ShaderMaterial
            >;
            look.update(frame({ bassFlash: 0 }), settings());
            expect(backdrop.material.uniforms.uFlash.value).toBe(0);
            expect((backdrop.material.uniforms.uTint.value as THREE.Color).getHex()).toBe(
                new THREE.Color(0x224466).getHex(),
            );
            look.update(frame({ bassFlash: 1 }), settings());
            expect(backdrop.material.uniforms.uFlash.value).toBeCloseTo(
                cubesEnhancedConfig.backdrop.flashMax ** cubesEnhancedConfig.backdrop.flashGamma,
            );
            expect(backdrop.position.z).toBeLessThan(0);
            look.dispose();
        });
    });

    describe('motion', () => {
        const locked = () => frame({ bassFlash: 0, beatPhase: 0, barPhase: 0, barLocked: true, dt: 0.1 });

        function runFrames(look: CubesEnhancedLook, s: CubesEnhancedSettings, count = 50) {
            for (let i = 0; i < count; i++) look.update(locked(), s);
        }

        it('moves the group and never the camera', () => {
            const { look, scene, camera } = setup();
            const before = camera.position.clone();
            const rotation = camera.rotation.clone();
            runFrames(look, settings());
            const group = sceneRootGroup(scene);
            expect(group.position.z).toBeGreaterThan(0);
            expect(group.position.length()).toBeGreaterThan(0.1);
            expect(camera.position.equals(before)).toBe(true);
            expect(camera.rotation.equals(rotation)).toBe(true);
            look.dispose();
        });

        it('scales with Camera motion, and 0 holds the group still', () => {
            const { look, scene } = setup();
            runFrames(look, settings({ cameraMotion: 0 }));
            const group = sceneRootGroup(scene);
            expect(group.position.length()).toBe(0);
            expect(group.rotation.z).toBe(0);
            look.dispose();
        });

        it('keeps the grid edges out of view: the combined offset stays inside the one-cell margin', () => {
            const { motion } = cubesEnhancedConfig;
            const dollyGrowth = (motion.dollyDistance / motion.cameraDistance) * motion.widestHalfWidth;
            const tilt = motion.driftTilt * motion.widestHalfWidth;
            expect(dollyGrowth + motion.driftSlide + tilt).toBeLessThan(1);

            const { look, scene } = setup();
            let worst = 0;
            for (let i = 0; i < 2000; i++) {
                look.update(locked(), settings());
                const group = sceneRootGroup(scene);
                worst = Math.max(
                    worst,
                    Math.abs(group.position.x) + Math.abs(group.rotation.z) * motion.widestHalfWidth,
                );
                expect(Math.abs(group.position.z)).toBeLessThanOrEqual(motion.dollyDistance + 1e-9);
            }
            expect(worst).toBeLessThan(motion.driftSlide + tilt + 1e-9);
            look.dispose();
        });

        it('zeroes motion under reduced motion, from the constructor and live', () => {
            const reduced = setup(true);
            runFrames(reduced.look, settings());
            const group = sceneRootGroup(reduced.scene);
            expect(group.position.length()).toBe(0);
            expect(group.rotation.z).toBe(0);
            reduced.look.dispose();

            const live = setup(false);
            runFrames(live.look, settings());
            const liveGroup = sceneRootGroup(live.scene);
            expect(liveGroup.position.length()).toBeGreaterThan(0);
            live.look.setReducedMotion(true);
            expect(liveGroup.position.length()).toBe(0);
            runFrames(live.look, settings(), 5);
            expect(liveGroup.position.length()).toBe(0);
            live.look.setReducedMotion(false);
            runFrames(live.look, settings());
            expect(liveGroup.position.length()).toBeGreaterThan(0);
            live.look.dispose();
        });
    });

    describe('dispose', () => {
        it('frees the composer, passes, geometries, materials and the override once, and is idempotent', () => {
            const { look, scene } = setup();
            const { grid, mesh, setMaterialOverride } = fakeGrid();
            scene.add(mesh);
            look.attach(grid);
            const material = setMaterialOverride.mock.calls[0][0] as THREE.MeshPhysicalMaterial;
            const group = sceneRootGroup(scene);
            const geometryDisposals: unknown[] = [];
            const materialDisposals: unknown[] = [];
            const spyOn = (target: THREE.EventDispatcher<{ dispose: object }>, into: unknown[]) =>
                target.addEventListener('dispose', () => into.push(target));
            spyOn(material, materialDisposals);
            for (const child of group.children) {
                const object = child as THREE.Mesh;
                spyOn(object.geometry, geometryDisposals);
                spyOn(object.material as THREE.Material, materialDisposals);
            }
            const composer = composers()[0];
            const bloom = blooms()[0];

            look.dispose();
            look.dispose();

            expect(composer.dispose).toHaveBeenCalledTimes(1);
            expect(bloom.dispose).toHaveBeenCalledTimes(1);
            expect((rec.outputs[0] as { dispose: ReturnType<typeof vi.fn> }).dispose).toHaveBeenCalledTimes(1);
            expect(geometryDisposals).toHaveLength(2);
            expect(materialDisposals).toHaveLength(3);
            expect(setMaterialOverride.mock.calls.map((call) => call[0])).toEqual([material, null]);
            expect(mesh.parent).toBe(scene);
            expect(group.children).toHaveLength(0);
        });

        it('does not put a mesh back that its grid already disposed', () => {
            const { look, scene } = setup();
            const { grid, mesh, setMaterialOverride } = fakeGrid();
            look.attach(grid);
            mesh.removeFromParent();
            look.dispose();
            expect(mesh.parent).toBeNull();
            expect(setMaterialOverride).toHaveBeenLastCalledWith(null);
            expect(scene.children.includes(mesh)).toBe(false);
        });

        it('makes every method a no-op afterwards', () => {
            const { look, scene, lights } = setup();
            look.dispose();
            const composer = composers()[0];
            const { grid, mesh, setMaterialOverride } = fakeGrid();
            const fillIntensity = lights.fill.intensity;
            look.attach(grid);
            look.update(frame({ bassFlash: 1 }), settings());
            look.render();
            look.resize(10, 10);
            look.setReducedMotion(true);
            expect(setMaterialOverride).not.toHaveBeenCalled();
            expect(mesh.parent).toBeNull();
            expect(composer.render).not.toHaveBeenCalled();
            expect(composer.size).toEqual([800, 600]);
            expect(lights.fill.intensity).toBe(fillIntensity);
            expect(scene.children.some((child) => child instanceof THREE.Group)).toBe(false);
        });

        it('survives disposing without ever attaching a grid', () => {
            const { look } = setup();
            expect(() => look.dispose()).not.toThrow();
        });
    });

    afterEach(() => {
        config.cubeMaterial = 'glass';
    });
});
