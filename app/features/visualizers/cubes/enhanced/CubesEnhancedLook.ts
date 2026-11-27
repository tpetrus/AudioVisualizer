import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { cubesEnhancedConfig } from './cubesEnhancedConfig';
import type {
    CubeGridLike,
    CubesEnhancedLookApi,
    CubesEnhancedLookOptions,
    CubesEnhancedSettings,
    CubesFxFrame,
} from './cubesEnhancedTypes';
import { createCubesFxUniforms, CubesFxState } from './cubesFxState';
import {
    BACKDROP_FRAGMENT,
    BACKDROP_VERTEX,
    createCubeFxUniforms,
    createSeedGenerator,
    CUBE_FX_PROGRAM_KEY,
    PARTICLE_FRAGMENT,
    PARTICLE_VERTEX,
    patchCubeShader,
} from './cubesEnhancedShaders';

function clamp01(value: number): number {
    return value > 0 ? (value < 1 ? value : 1) : 0;
}

// Everything the look changes on objects it does not own, saved by the constructor and put back by dispose().
interface SavedState {
    background: THREE.Scene['background'];
    fog: THREE.Scene['fog'];
    environmentIntensity: number;
    toneMapping: THREE.ToneMapping;
    toneMappingExposure: number;
    keyIntensity: number;
    fillIntensity: number;
    ambientIntensity: number;
    keyColor: THREE.Color;
    fillColor: THREE.Color;
    ambientColor: THREE.Color;
}

// The enhanced look of the cubes: bloom through a composer, a dark glossy backdrop with fog, a cube material that
// ripples and shatters on the GPU, a shader-driven particle layer and beat-synced motion. It lives beside the basic look
// on the same renderer and scene (so toggling needs no new WebGL context) and hands everything back on dispose().
export class CubesEnhancedLook implements CubesEnhancedLookApi {
    private readonly renderer: THREE.WebGLRenderer;
    private readonly scene: THREE.Scene;
    private readonly lights: CubesEnhancedLookOptions['lights'];

    // D11: all of the look's objects sit under this group, and the motion moves it, never the camera.
    private readonly group = new THREE.Group();
    private readonly state = new CubesFxState();
    private readonly fx = createCubesFxUniforms();
    private readonly gpu = createCubeFxUniforms();
    private readonly emissive: { base: number; flash: number };

    private readonly material: THREE.MeshPhysicalMaterial;
    private readonly backdropGeometry: THREE.PlaneGeometry;
    private readonly backdropMaterial: THREE.ShaderMaterial;
    private readonly backdrop: THREE.Mesh;
    private readonly backdropColor = new THREE.Color();
    private readonly particleGeometry: THREE.BufferGeometry;
    private readonly particleMaterial: THREE.ShaderMaterial;
    private readonly particles: THREE.Points;
    private readonly background: THREE.Color;
    private readonly saved: SavedState;

    private composer: EffectComposer | undefined;
    private renderPass: RenderPass | undefined;
    private bloom: UnrealBloomPass | undefined;
    private output: OutputPass | undefined;
    // The bloom's resolution, created once and updated in place.
    private readonly bloomResolution = new THREE.Vector2(1, 1);

    private grid: CubeGridLike | undefined;
    private width: number;
    private height: number;
    private reduced: boolean;
    private disposed = false;

    constructor(options: CubesEnhancedLookOptions) {
        const config = cubesEnhancedConfig;
        const { renderer, scene, lights } = options;
        this.renderer = renderer;
        this.scene = scene;
        this.lights = lights;
        this.width = options.size.width;
        this.height = options.size.height;
        this.reduced = options.reducedMotion;

        this.saved = {
            background: scene.background,
            fog: scene.fog,
            environmentIntensity: scene.environmentIntensity,
            toneMapping: renderer.toneMapping,
            toneMappingExposure: renderer.toneMappingExposure,
            keyIntensity: lights.key.intensity,
            fillIntensity: lights.fill.intensity,
            ambientIntensity: lights.ambient.intensity,
            keyColor: lights.key.color.clone(),
            fillColor: lights.fill.color.clone(),
            ambientColor: lights.ambient.color.clone(),
        };

        // The color pipeline: the composer renders in linear light and the output pass applies the renderer's tone
        // mapping and sRGB encoding, which is what the canvas would have done. The lights are the basic look's times
        // the configured scales (1 by default).
        renderer.toneMapping = config.toneMapping === 'aces' ? THREE.ACESFilmicToneMapping : THREE.NoToneMapping;
        renderer.toneMappingExposure = config.exposure;
        scene.environmentIntensity = this.saved.environmentIntensity * config.lights.environmentScale;
        lights.key.intensity = this.saved.keyIntensity * config.lights.keyScale;
        lights.fill.intensity = this.saved.fillIntensity * config.lights.fillScale;
        lights.ambient.intensity = this.saved.ambientIntensity * config.lights.ambientScale;
        lights.key.color.set(config.lights.keyColor);
        lights.fill.color.set(config.lights.fillColor);
        lights.ambient.color.set(config.lights.ambientColor);

        // The backdrop replaces the basic background flash, so the background itself is the fog's dark color.
        this.background = new THREE.Color(config.backdrop.fogColor);
        scene.background = this.background;
        scene.fog = new THREE.FogExp2(config.backdrop.fogColor, config.backdrop.fogDensity);

        const variant = config.material[config.cubeMaterial];
        this.emissive = { base: variant.emissiveBase, flash: variant.emissiveFlash };
        this.material = this.createCubeMaterial();

        const { backdrop: backdropConfig } = config;
        this.backdropGeometry = new THREE.PlaneGeometry(backdropConfig.size, backdropConfig.size);
        this.backdropMaterial = new THREE.ShaderMaterial({
            vertexShader: BACKDROP_VERTEX,
            fragmentShader: BACKDROP_FRAGMENT,
            uniforms: {
                uTint: { value: this.backdropColor },
                uBase: { value: backdropConfig.base },
                uVignette: { value: backdropConfig.vignette },
                uSheen: { value: backdropConfig.sheen },
                uFlash: { value: 0 },
            },
            fog: false,
        });
        this.backdrop = new THREE.Mesh(this.backdropGeometry, this.backdropMaterial);
        this.backdrop.position.z = backdropConfig.z;
        this.backdrop.renderOrder = -1;
        this.backdrop.frustumCulled = false;
        this.group.add(this.backdrop);

        const { particles: particleConfig } = config;
        this.particleGeometry = createParticleGeometry(particleConfig.count, particleConfig.seed);
        this.particleMaterial = new THREE.ShaderMaterial({
            vertexShader: PARTICLE_VERTEX,
            fragmentShader: PARTICLE_FRAGMENT,
            uniforms: {
                uTime: { value: 0 },
                uEmit: { value: 0 },
                uBass: { value: 0 },
                uPointScale: { value: 1 },
                uSpread: { value: new THREE.Vector3(particleConfig.spreadX, particleConfig.spreadY, 0) },
                uDepth: { value: new THREE.Vector2(particleConfig.depthMin, particleConfig.depthMax) },
                uRise: { value: particleConfig.riseSpeed },
                uSway: { value: particleConfig.sway },
                uEmitSize: { value: particleConfig.emitSize },
                uColorA: { value: new THREE.Color() },
                uColorB: { value: new THREE.Color() },
                uBrightness: { value: particleConfig.brightness },
                uAlpha: { value: particleConfig.alpha },
            },
            blending: THREE.AdditiveBlending,
            transparent: true,
            depthWrite: false,
            fog: false,
        });
        this.particles = new THREE.Points(this.particleGeometry, this.particleMaterial);
        this.particles.frustumCulled = false;
        this.particles.renderOrder = 2;
        this.particles.visible = false;
        this.group.add(this.particles);

        scene.add(this.group);
        this.updatePointScale();
        this.build(options.camera);
    }

    attach(grid: CubeGridLike): void {
        if (this.disposed) return;
        const previous = this.grid;
        if (previous && previous !== grid) {
            // The hook normally disposes the old grid first (which removes its mesh); this covers one that is still alive.
            previous.mesh.removeFromParent();
            previous.setMaterialOverride(null);
        }
        this.grid = grid;
        // Adding to a new parent removes the mesh from the scene the hook put it in.
        this.group.add(grid.mesh);
        grid.setMaterialOverride(this.material);
    }

    update(frame: Readonly<CubesFxFrame>, settings: Readonly<CubesEnhancedSettings>): void {
        if (this.disposed) return;
        const config = cubesEnhancedConfig;
        const fx = this.fx;
        this.state.step(frame, this.reduced, fx);

        const gpu = this.gpu;
        gpu.fxTime.value = fx.time;
        gpu.fxWaveAmplitude.value = fx.waveAmplitude;
        gpu.fxWavePhase.value = fx.wavePhase;
        gpu.fxShatter.value = fx.shatter;
        gpu.fxEmissive.value = this.emissive.base + fx.bassFlash * this.emissive.flash;

        // The backdrop takes over the basic look's flash: the resting color scaled by the capped, gamma-compensated pulse.
        this.backdropColor.copy(settings.restingColor);
        this.backdropMaterial.uniforms.uFlash.value =
            (fx.bassFlash * config.backdrop.flashMax) ** config.backdrop.flashGamma;

        const uniforms = this.particleMaterial.uniforms;
        uniforms.uTime.value = fx.time;
        uniforms.uEmit.value = fx.particleEmit;
        uniforms.uBass.value = fx.bassFlash;
        (uniforms.uColorA.value as THREE.Color).copy(settings.restingColor);
        (uniforms.uColorB.value as THREE.Color).copy(settings.raisedColor);
        const visible = Math.round(config.particles.count * clamp01(settings.particles));
        this.particleGeometry.setDrawRange(0, visible);
        this.particles.visible = visible > 0;

        // Motion moves the group only; the camera and its orbit state are never touched (D11).
        const motion = clamp01(settings.cameraMotion);
        this.group.position.set(
            fx.motionDrift * config.motion.driftSlide * motion,
            0,
            fx.motionDolly * config.motion.dollyDistance * motion,
        );
        this.group.rotation.z = fx.motionDrift * config.motion.driftTilt * motion;

        const bloom = this.bloom;
        if (bloom) {
            bloom.strength = fx.bloomStrength * clamp01(settings.glow) * config.post.bloomStrengthMax;
            bloom.enabled = bloom.strength > 0 && !this.tooSmallForBloom();
        }
    }

    render(): void {
        if (this.disposed) return;
        this.composer?.render();
    }

    resize(width: number, height: number): void {
        if (this.disposed) return;
        this.width = width;
        this.height = height;
        this.updatePointScale();
        this.updateBloomResolution();
        this.sizeComposer();
        if (this.bloom && this.bloom.enabled && this.tooSmallForBloom()) this.bloom.enabled = false;
    }

    setReducedMotion(reduced: boolean): void {
        if (this.disposed) return;
        this.reduced = reduced;
        if (reduced) {
            // Stop at once; the next update keeps the motion at zero.
            this.group.position.set(0, 0, 0);
            this.group.rotation.z = 0;
        }
    }

    dispose(): void {
        if (this.disposed) return;
        this.disposed = true;

        const grid = this.grid;
        this.grid = undefined;
        if (grid) {
            // A grid the hook already disposed has left the group; putting its mesh back would resurrect it.
            if (grid.mesh.parent === this.group) this.scene.add(grid.mesh);
            grid.setMaterialOverride(null);
        }
        this.scene.remove(this.group);
        this.group.clear();

        this.renderPass?.dispose();
        this.bloom?.dispose();
        this.output?.dispose();
        this.composer?.dispose();
        this.renderPass = undefined;
        this.bloom = undefined;
        this.output = undefined;
        this.composer = undefined;

        this.material.dispose();
        this.backdropGeometry.dispose();
        this.backdropMaterial.dispose();
        this.particleGeometry.dispose();
        this.particleMaterial.dispose();

        const { saved, renderer, scene, lights } = this;
        scene.background = saved.background;
        scene.fog = saved.fog;
        scene.environmentIntensity = saved.environmentIntensity;
        renderer.toneMapping = saved.toneMapping;
        renderer.toneMappingExposure = saved.toneMappingExposure;
        lights.key.intensity = saved.keyIntensity;
        lights.fill.intensity = saved.fillIntensity;
        lights.ambient.intensity = saved.ambientIntensity;
        lights.key.color.copy(saved.keyColor);
        lights.fill.color.copy(saved.fillColor);
        lights.ambient.color.copy(saved.ambientColor);
    }

    // The glass of cubeGrid.ts (or, as the measured fallback, an opaque emissive cube) with the grid effects injected.
    private createCubeMaterial(): THREE.MeshPhysicalMaterial {
        const { cubeMaterial, material: variants } = cubesEnhancedConfig;
        const variant = variants[cubeMaterial];
        const glass = cubeMaterial === 'glass';
        const material = new THREE.MeshPhysicalMaterial({
            color: variant.color,
            metalness: variant.metalness,
            roughness: variant.roughness,
            clearcoat: variant.clearcoat,
            clearcoatRoughness: variant.clearcoatRoughness,
            ior: variant.ior,
            transparent: glass,
            opacity: variant.opacity,
            // Glass shows its back faces and writes no depth, so overlapping cubes show through each other.
            side: glass ? THREE.DoubleSide : THREE.FrontSide,
            depthWrite: !glass,
        });
        material.onBeforeCompile = (shader) => patchCubeShader(shader, this.gpu);
        material.customProgramCacheKey = () => CUBE_FX_PROGRAM_KEY;
        return material;
    }

    // The composer runs on every renderer, software included, so the end-to-end tests exercise it.
    private build(camera: THREE.PerspectiveCamera): void {
        const { post } = cubesEnhancedConfig;
        this.updateBloomResolution();
        const composer = new EffectComposer(this.renderer);
        this.renderPass = new RenderPass(this.scene, camera);
        this.bloom = new UnrealBloomPass(this.bloomResolution, 0, post.bloomRadius, post.bloomThreshold);
        this.bloom.enabled = false;
        this.output = new OutputPass();
        composer.addPass(this.renderPass);
        composer.addPass(this.bloom);
        composer.addPass(this.output);
        this.composer = composer;
        this.sizeComposer();
    }

    private tooSmallForBloom(): boolean {
        const ratio = this.renderer.getPixelRatio();
        const min = cubesEnhancedConfig.post.bloomMinSidePx;
        return this.width * ratio < min || this.height * ratio < min;
    }

    // The bloom's resolution is the drawing size in device pixels times the configured share.
    private updateBloomResolution(): void {
        const ratio = this.renderer.getPixelRatio();
        const scale = cubesEnhancedConfig.post.bloomResolutionScale;
        this.bloomResolution.set(
            Math.max(1, Math.round(this.width * ratio * scale)),
            Math.max(1, Math.round(this.height * ratio * scale)),
        );
    }

    private sizeComposer(): void {
        if (!this.composer || !this.bloom) return;
        this.composer.setSize(this.width, this.height);
        // The composer hands every pass the full drawing size and the bloom's first target is half of what it is given,
        // so twice the wanted resolution makes that target the configured share of the drawing size.
        this.bloom.setSize(this.bloomResolution.x * 2, this.bloomResolution.y * 2);
    }

    private updatePointScale(): void {
        this.particleMaterial.uniforms.uPointScale.value =
            this.renderer.getPixelRatio() * cubesEnhancedConfig.particles.size;
    }
}

// A fixed buffer of seeds: `position` holds three in 0..1 and `aRand` two more. The shader turns them into positions, so
// nothing is uploaded after this.
function createParticleGeometry(count: number, seed: number): THREE.BufferGeometry {
    const random = createSeedGenerator(seed);
    const seeds = new Float32Array(count * 3);
    const extra = new Float32Array(count * 2);
    for (let i = 0; i < seeds.length; i++) seeds[i] = random();
    for (let i = 0; i < extra.length; i++) extra[i] = random();
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(seeds, 3));
    geometry.setAttribute('aRand', new THREE.BufferAttribute(extra, 2));
    geometry.setDrawRange(0, 0);
    return geometry;
}
