import * as THREE from 'three';
import { HDRLoader } from 'three/addons/loaders/HDRLoader.js';
import { Reflector } from 'three/addons/objects/Reflector.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { disposeScene } from '~/lib/three/disposeScene';
import type { DancingCharacterClub } from '../dancingCharacterClub';
import { CLUB_BACKGROUND, CLUB_FLOOR_HALF } from '../dancingCharacterConfig';
import { ENHANCED_ASSET_URLS } from './enhancedAssetUrls';
import {
    ENHANCED_CATCHER_LIFT,
    ENHANCED_CATCHER_OPACITY,
    ENHANCED_CATCHER_RENDER_ORDER,
    ENHANCED_CHARACTER_ENV_INTENSITY,
    ENHANCED_FRAME_NORMAL_SCALE,
    ENHANCED_FRAME_REPEAT_U,
    ENHANCED_FRAME_REPEAT_V,
    ENHANCED_FRAME_ROUGHNESS,
    ENHANCED_GLASS_CLIP_BIAS,
    ENHANCED_GLASS_COLOR,
    ENHANCED_GLASS_LIFT,
    ENHANCED_GLASS_MIN_RESOLUTION,
    ENHANCED_GLASS_OPACITY,
    ENHANCED_GLASS_RENDER_ORDER,
    ENHANCED_GLASS_RESOLUTION_FACTOR,
    ENHANCED_GLASS_SAMPLES,
    ENHANCED_HDR_ENVIRONMENT_INTENSITY,
    ENHANCED_MAX_ANISOTROPY,
    ENHANCED_POLYGON_OFFSET_FACTOR,
    ENHANCED_POLYGON_OFFSET_UNITS,
    ENHANCED_ROOM_ENVIRONMENT_INTENSITY,
    ENHANCED_ROOM_SIGMA,
    ENHANCED_SHADOW_BIAS,
    ENHANCED_SHADOW_DEPTH_MARGIN,
    ENHANCED_SHADOW_MAP_SIZE,
    ENHANCED_SHADOW_MARGIN,
    ENHANCED_SHADOW_MIN_NEAR,
    ENHANCED_SHADOW_NORMAL_BIAS,
    ENHANCED_SHADOW_RADIUS,
    ENHANCED_SKY_DARKEN,
    ENHANCED_SKY_HEIGHT_SEGMENTS,
    ENHANCED_SKY_HORIZON_END,
    ENHANCED_SKY_HORIZON_POWER,
    ENHANCED_SKY_HORIZON_START,
    ENHANCED_SKY_RADIUS,
    ENHANCED_SKY_RENDER_ORDER,
    ENHANCED_SKY_WIDTH_SEGMENTS,
    ENHANCED_TONE_MAPPING,
    ENHANCED_TONE_MAPPING_EXPOSURE,
} from './dancingCharacterEnhancedConfig';

export type EnhancedStatus = 'loading' | 'ready' | 'error';

export interface EnhancedLookContext {
    renderer: THREE.WebGLRenderer;
    scene: THREE.Scene;
    // Exposes its tile, seam, cone and frame materials read-only (`club.materials`) and the floor height.
    club: DancingCharacterClub;
    keyLight: THREE.DirectionalLight;
    // The useThreeScene teardown signal: loads stop on it and whatever still resolves afterwards is disposed.
    signal: AbortSignal;
    onStatus: (status: EnhancedStatus) => void;
}

export interface EnhancedLook {
    apply(): void;
    // `bounds` is the dance's full-size world box (DancingCharacterScene.danceBounds): the model itself is still
    // scaled down for its fade-in when this is called.
    onModelChanged(model: THREE.Object3D, bounds: THREE.Box3): void;
    // Called from the scene's resize: the glass layer's render target follows the drawing buffer.
    resize(): void;
    dispose(): void;
}

const TONE_MAPPINGS = { agx: THREE.AgXToneMapping, neutral: THREE.NeutralToneMapping } as const;

// The glass layer's shader is the Reflector's own with one change: the output is translucent (the Reflector's
// version writes an opaque overlay blend, which would hide the LED floor). It multiplies the reflection by a tint and
// writes `opacity` as alpha, so the layer blends over the tiles. Tone mapping is left out on purpose (the material is
// `toneMapped = false`): the reflection holds untoned linear colors, and the tiles it mirrors are not tone mapped
// either, so the reflected LEDs keep their colors.
const GLASS_SHADER = {
    name: 'GlassReflectorShader',
    uniforms: {
        color: { value: null },
        tDiffuse: { value: null },
        textureMatrix: { value: null },
        opacity: { value: ENHANCED_GLASS_OPACITY },
    },
    vertexShader: /* glsl */ `
        uniform mat4 textureMatrix;
        varying vec4 vUv;

        #include <common>
        #include <logdepthbuf_pars_vertex>

        void main() {
            vUv = textureMatrix * vec4( position, 1.0 );
            gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
            #include <logdepthbuf_vertex>
        }`,
    fragmentShader: /* glsl */ `
        uniform vec3 color;
        uniform float opacity;
        uniform sampler2D tDiffuse;
        varying vec4 vUv;

        #include <logdepthbuf_pars_fragment>

        void main() {
            #include <logdepthbuf_fragment>
            vec4 base = texture2DProj( tDiffuse, vUv );
            gl_FragColor = vec4( base.rgb * color, opacity );
            #include <colorspace_fragment>
        }`,
};

// The sky dome: an inverted sphere around the scene, drawn first. Until the sky texture arrives `skyMix` is 0 and the
// dome is plain fog color. The sky fades into the fog color toward the horizon and below it, which hides the bright
// glow band of the converted sky and makes the horizon match the club's fog (and background) color with no seam.
const SKY_VERTEX_SHADER = /* glsl */ `
    varying vec3 vDirection;
    void main() {
        // The dome is centered on the origin with no rotation, so its local position is the view direction.
        vDirection = position;
        gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
    }`;
const SKY_FRAGMENT_SHADER = /* glsl */ `
    uniform sampler2D skyMap;
    uniform float skyMix;
    uniform vec3 fogColor;
    uniform float darken;
    uniform float horizonStart;
    uniform float horizonEnd;
    uniform float horizonPower;
    varying vec3 vDirection;

    void main() {
        vec3 direction = normalize( vDirection );
        // The same equirectangular mapping three uses for its environment maps.
        vec2 uv = vec2( atan( direction.z, direction.x ) * 0.15915494 + 0.5, asin( clamp( direction.y, -1.0, 1.0 ) ) * 0.31830989 + 0.5 );
        vec3 sky = texture2D( skyMap, uv ).rgb * darken;
        float visible = pow( smoothstep( horizonStart, horizonEnd, direction.y ), horizonPower ) * skyMix;
        gl_FragColor = vec4( mix( fogColor, sky, visible ), 1.0 );
        #include <colorspace_fragment>
    }`;

// Whether `error` is the result of aborting the loads (ours or the scene's teardown) rather than a real failure.
function isAbort(error: unknown): boolean {
    return error instanceof Error && error.name === 'AbortError';
}

export function createEnhancedLook(ctx: EnhancedLookContext): EnhancedLook {
    const { renderer, scene, club, keyLight, signal, onStatus } = ctx;
    const materials = club.materials;

    let disposed = false;
    let applied = false;
    // The late-arrival rule: once torn down (or the signal aborted), whatever resolves is disposed, never applied.
    const isStale = (): boolean => disposed || signal.aborted;

    // Created in apply().
    let pmrem: THREE.PMREMGenerator | null = null;
    let roomTarget: THREE.WebGLRenderTarget | null = null;
    let hdrTarget: THREE.WebGLRenderTarget | null = null;
    let catcher: THREE.Mesh<THREE.PlaneGeometry, THREE.ShadowMaterial> | null = null;
    let reflector: Reflector | null = null;
    let floorGeometry: THREE.PlaneGeometry | null = null;
    let dome: THREE.Mesh<THREE.SphereGeometry, THREE.ShaderMaterial> | null = null;
    // Textures loaded from the assets, freed in dispose().
    let skyTexture: THREE.Texture | null = null;
    const frameTextures: THREE.Texture[] = [];

    // Scratch objects for the shadow fit; the fit runs once per character load, but nothing needs to be allocated.
    const modelBox = new THREE.Box3();
    const lightBox = new THREE.Box3();
    const corner = new THREE.Vector3();
    const lightTarget = new THREE.Vector3();
    const bufferSize = new THREE.Vector2();

    const maxAnisotropy = (): number => Math.min(ENHANCED_MAX_ANISOTROPY, renderer.capabilities.getMaxAnisotropy());

    // ---- Floor layers ----

    const glassSide = (pixels: number): number =>
        Math.max(ENHANCED_GLASS_MIN_RESOLUTION, Math.round(pixels * ENHANCED_GLASS_RESOLUTION_FACTOR));

    function placeFloorLayers(): void {
        const y = club.floorSurfaceY;
        if (catcher) catcher.position.y = y + ENHANCED_CATCHER_LIFT;
        if (reflector) reflector.position.y = y + ENHANCED_GLASS_LIFT;
    }

    function createFloorLayers(): void {
        const geometry = new THREE.PlaneGeometry(CLUB_FLOOR_HALF * 2, CLUB_FLOOR_HALF * 2);
        floorGeometry = geometry;

        // Receives the key light's shadow and shows nothing else: the black shadow blends over the LED tiles.
        catcher = new THREE.Mesh(
            geometry,
            new THREE.ShadowMaterial({
                opacity: ENHANCED_CATCHER_OPACITY,
                transparent: true,
                depthWrite: false,
                polygonOffset: true,
                polygonOffsetFactor: ENHANCED_POLYGON_OFFSET_FACTOR,
                polygonOffsetUnits: ENHANCED_POLYGON_OFFSET_UNITS,
            }),
        );
        catcher.rotation.x = -Math.PI / 2;
        catcher.receiveShadow = true;
        catcher.renderOrder = ENHANCED_CATCHER_RENDER_ORDER;

        // The reflection renders at a share of the drawing buffer; it is faint and soft, so the saving costs nothing.
        renderer.getDrawingBufferSize(bufferSize);
        reflector = new Reflector(geometry, {
            color: new THREE.Color(ENHANCED_GLASS_COLOR),
            textureWidth: glassSide(bufferSize.x),
            textureHeight: glassSide(bufferSize.y),
            clipBias: ENHANCED_GLASS_CLIP_BIAS,
            multisample: ENHANCED_GLASS_SAMPLES,
            shader: GLASS_SHADER,
        });
        const glass = reflector.material as THREE.ShaderMaterial;
        glass.transparent = true;
        glass.depthWrite = false;
        glass.toneMapped = false;
        glass.polygonOffset = true;
        glass.polygonOffsetFactor = ENHANCED_POLYGON_OFFSET_FACTOR;
        glass.polygonOffsetUnits = ENHANCED_POLYGON_OFFSET_UNITS;
        reflector.rotation.x = -Math.PI / 2;
        reflector.renderOrder = ENHANCED_GLASS_RENDER_ORDER;

        placeFloorLayers();
        scene.add(catcher, reflector);
    }

    // ---- Sky ----

    function createDome(): THREE.ShaderMaterial {
        const material = new THREE.ShaderMaterial({
            uniforms: {
                skyMap: { value: null },
                skyMix: { value: 0 },
                fogColor: { value: new THREE.Color(CLUB_BACKGROUND) },
                darken: { value: ENHANCED_SKY_DARKEN },
                horizonStart: { value: ENHANCED_SKY_HORIZON_START },
                horizonEnd: { value: ENHANCED_SKY_HORIZON_END },
                horizonPower: { value: ENHANCED_SKY_HORIZON_POWER },
            },
            vertexShader: SKY_VERTEX_SHADER,
            fragmentShader: SKY_FRAGMENT_SHADER,
            side: THREE.BackSide,
            depthWrite: false,
            fog: false,
            toneMapped: false,
        });
        dome = new THREE.Mesh(
            new THREE.SphereGeometry(ENHANCED_SKY_RADIUS, ENHANCED_SKY_WIDTH_SEGMENTS, ENHANCED_SKY_HEIGHT_SEGMENTS),
            material,
        );
        dome.renderOrder = ENHANCED_SKY_RENDER_ORDER;
        // A dome around the camera is always in view.
        dome.frustumCulled = false;
        scene.add(dome);
        return material;
    }

    // ---- Environment ----

    function createRoomEnvironment(generator: THREE.PMREMGenerator): void {
        const room = new RoomEnvironment();
        roomTarget = generator.fromScene(room, ENHANCED_ROOM_SIGMA);
        disposeScene(room); // the room is only needed to render the map
        scene.environment = roomTarget.texture;
        scene.environmentIntensity = ENHANCED_ROOM_ENVIRONMENT_INTENSITY;
    }

    // ---- Asset loading ----

    async function fetchResponse(url: string): Promise<Response> {
        const response = await fetch(url, { signal });
        if (!response.ok) throw new Error(`HTTP ${response.status} for ${url}`);
        return response;
    }

    // Decodes an image off the main thread into a texture. `flipY` is asked of the decoder (the texture's own flipY
    // does nothing for an ImageBitmap), the way three's ImageBitmapLoader does it.
    async function loadImageTexture(url: string, colorSpace: THREE.ColorSpace): Promise<THREE.Texture> {
        const blob = await (await fetchResponse(url)).blob();
        const bitmap = await createImageBitmap(blob, { imageOrientation: 'flipY' });
        const texture = new THREE.Texture(bitmap);
        texture.flipY = false;
        texture.colorSpace = colorSpace;
        texture.needsUpdate = true;
        if (isStale()) {
            texture.dispose();
            bitmap.close();
            throw new DOMException('Enhanced look was disposed', 'AbortError');
        }
        return texture;
    }

    async function loadEnvironmentMap(generator: THREE.PMREMGenerator): Promise<void> {
        const buffer = await (await fetchResponse(ENHANCED_ASSET_URLS.environmentHdr)).arrayBuffer();
        const data = new HDRLoader().parse(buffer);
        const source = new THREE.DataTexture(data.data, data.width, data.height, THREE.RGBAFormat, data.type);
        source.colorSpace = THREE.LinearSRGBColorSpace;
        source.minFilter = THREE.LinearFilter;
        source.magFilter = THREE.LinearFilter;
        source.generateMipmaps = false;
        source.flipY = true;
        source.mapping = THREE.EquirectangularReflectionMapping;
        source.needsUpdate = true;
        if (isStale()) {
            source.dispose();
            throw new DOMException('Enhanced look was disposed', 'AbortError');
        }
        const target = generator.fromEquirectangular(source);
        // The prefiltered map replaces the equirectangular source.
        source.dispose();
        hdrTarget = target;
        scene.environment = target.texture;
        scene.environmentIntensity = ENHANCED_HDR_ENVIRONMENT_INTENSITY;
        roomTarget?.dispose();
        roomTarget = null;
    }

    async function loadSky(domeMaterial: THREE.ShaderMaterial): Promise<void> {
        const texture = await loadImageTexture(ENHANCED_ASSET_URLS.skyTexture, THREE.SRGBColorSpace);
        skyTexture = texture;
        domeMaterial.uniforms.skyMap.value = texture;
        domeMaterial.uniforms.skyMix.value = 1;
    }

    async function loadFrameMap(
        url: string,
        colorSpace: THREE.ColorSpace,
        assign: (texture: THREE.Texture) => void,
    ): Promise<void> {
        const texture = await loadImageTexture(url, colorSpace);
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.RepeatWrapping;
        texture.repeat.set(ENHANCED_FRAME_REPEAT_U, ENHANCED_FRAME_REPEAT_V);
        texture.anisotropy = maxAnisotropy();
        frameTextures.push(texture);
        assign(texture);
        materials.frame.needsUpdate = true;
    }

    function startLoads(generator: THREE.PMREMGenerator, domeMaterial: THREE.ShaderMaterial): void {
        const { frame } = ENHANCED_ASSET_URLS;
        const frameMaterial = materials.frame;
        const loads: Promise<void>[] = [
            loadEnvironmentMap(generator),
            loadSky(domeMaterial),
            loadFrameMap(frame.map, THREE.SRGBColorSpace, (texture) => {
                frameMaterial.map = texture;
            }),
            loadFrameMap(frame.normalMap, THREE.NoColorSpace, (texture) => {
                frameMaterial.normalMap = texture;
                frameMaterial.normalScale.setScalar(ENHANCED_FRAME_NORMAL_SCALE);
            }),
            loadFrameMap(frame.roughnessMap, THREE.NoColorSpace, (texture) => {
                frameMaterial.roughnessMap = texture;
                frameMaterial.roughness = ENHANCED_FRAME_ROUGHNESS;
            }),
        ];
        let failed = false;
        const settled = loads.map((load) =>
            load.catch((error: unknown) => {
                // An abort (the scene is going away) is not a failure; neither is a late result we threw away.
                if (isStale() || isAbort(error) || failed) return;
                failed = true;
                console.warn('Enhanced graphics: could not load an asset, keeping what loaded.', error);
                onStatus('error');
            }),
        );
        onStatus('loading');
        void Promise.all(settled).then(() => {
            if (!failed && !isStale()) onStatus('ready');
        });
    }

    // ---- The character ----

    function fitShadowCamera(bounds: THREE.Box3): void {
        modelBox.copy(bounds);
        if (modelBox.isEmpty()) return;
        const shadow = keyLight.shadow;
        const camera = shadow.camera;
        // Poses the shadow camera the way three will at render time (at the light, looking at its target).
        keyLight.updateWorldMatrix(true, false);
        keyLight.target.updateWorldMatrix(true, false);
        camera.position.setFromMatrixPosition(keyLight.matrixWorld);
        camera.lookAt(lightTarget.setFromMatrixPosition(keyLight.target.matrixWorld));
        camera.updateMatrixWorld();

        // The model's eight corners in the light's view give the box the shadow camera must cover.
        lightBox.makeEmpty();
        for (let i = 0; i < 8; i++) {
            corner.set(
                i & 1 ? modelBox.max.x : modelBox.min.x,
                i & 2 ? modelBox.max.y : modelBox.min.y,
                i & 4 ? modelBox.max.z : modelBox.min.z,
            );
            lightBox.expandByPoint(corner.applyMatrix4(camera.matrixWorldInverse));
        }
        camera.left = lightBox.min.x - ENHANCED_SHADOW_MARGIN;
        camera.right = lightBox.max.x + ENHANCED_SHADOW_MARGIN;
        camera.bottom = lightBox.min.y - ENHANCED_SHADOW_MARGIN;
        camera.top = lightBox.max.y + ENHANCED_SHADOW_MARGIN;
        // The view looks down -z, so the nearest point has the largest z.
        camera.near = Math.max(ENHANCED_SHADOW_MIN_NEAR, -lightBox.max.z - ENHANCED_SHADOW_MARGIN);
        camera.far = -lightBox.min.z + ENHANCED_SHADOW_MARGIN + ENHANCED_SHADOW_DEPTH_MARGIN;
        camera.updateProjectionMatrix();
    }

    function prepareTexture(texture: { anisotropy: number; needsUpdate: boolean }, anisotropy: number): void {
        if (texture.anisotropy === anisotropy) return;
        texture.anisotropy = anisotropy;
        texture.needsUpdate = true;
    }

    function prepareMaterial(material: THREE.Material, anisotropy: number): void {
        if (!(material instanceof THREE.MeshStandardMaterial)) return;
        material.envMapIntensity = ENHANCED_CHARACTER_ENV_INTENSITY;
        for (const value of Object.values(material) as unknown[]) {
            if (value instanceof THREE.Texture) prepareTexture(value, anisotropy);
        }
    }

    return {
        apply(): void {
            if (disposed || applied) return;
            applied = true;

            renderer.toneMapping = TONE_MAPPINGS[ENHANCED_TONE_MAPPING];
            renderer.toneMappingExposure = ENHANCED_TONE_MAPPING_EXPOSURE;
            renderer.outputColorSpace = THREE.SRGBColorSpace;
            renderer.shadowMap.enabled = true;
            renderer.shadowMap.type = THREE.PCFShadowMap;

            keyLight.castShadow = true;
            keyLight.shadow.mapSize.set(ENHANCED_SHADOW_MAP_SIZE, ENHANCED_SHADOW_MAP_SIZE);
            keyLight.shadow.bias = ENHANCED_SHADOW_BIAS;
            keyLight.shadow.normalBias = ENHANCED_SHADOW_NORMAL_BIAS;
            keyLight.shadow.radius = ENHANCED_SHADOW_RADIUS;

            // The self-lit materials keep their exact colors: tone mapping would desaturate the rainbow floor and the
            // beams. The lit frame and the character are the ones that get tone mapped.
            for (const material of [materials.tile, materials.seam, ...materials.cones]) {
                material.toneMapped = false;
                material.needsUpdate = true;
            }

            createFloorLayers();
            const domeMaterial = createDome();
            const generator = new THREE.PMREMGenerator(renderer);
            pmrem = generator;
            createRoomEnvironment(generator);
            startLoads(generator, domeMaterial);
        },

        onModelChanged(model: THREE.Object3D, bounds: THREE.Box3): void {
            if (disposed) return;
            const anisotropy = maxAnisotropy();
            model.traverse((object) => {
                const mesh = object as THREE.Mesh;
                if (!mesh.isMesh) return;
                mesh.castShadow = true;
                for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
                    prepareMaterial(material, anisotropy);
                }
            });
            fitShadowCamera(bounds);
            // The floor moved with the new dancer's feet.
            placeFloorLayers();
        },

        resize(): void {
            if (disposed || !reflector) return;
            // A fixed target would stay at the size the page started with, so going fullscreen would blur the glass.
            renderer.getDrawingBufferSize(bufferSize);
            reflector.getRenderTarget().setSize(glassSide(bufferSize.x), glassSide(bufferSize.y));
        },

        dispose(): void {
            if (disposed) return;
            disposed = true;

            if (catcher) {
                scene.remove(catcher);
                catcher.material.dispose();
            }
            if (reflector) {
                scene.remove(reflector);
                reflector.dispose(); // its render target and its material
            }
            floorGeometry?.dispose();
            if (dome) {
                scene.remove(dome);
                dome.geometry.dispose();
                dome.material.dispose();
            }
            skyTexture?.dispose();

            // The frame outlives this look, so it must not keep pointing at textures freed here.
            const frame = materials.frame;
            frame.map = null;
            frame.normalMap = null;
            frame.roughnessMap = null;
            frame.needsUpdate = true;
            for (const texture of frameTextures) texture.dispose();

            if (scene.environment === roomTarget?.texture || scene.environment === hdrTarget?.texture) {
                scene.environment = null;
            }
            roomTarget?.dispose();
            hdrTarget?.dispose();
            pmrem?.dispose();
        },
    };
}
