import * as THREE from 'three';
import {
    CLUB_BACKGROUND,
    CLUB_CONE_BASE_OPACITY,
    CLUB_CONE_FADE_END,
    CLUB_CONE_FADE_START,
    CLUB_CONE_FLASH_OPACITY,
    CLUB_CONE_HEIGHT,
    CLUB_CONE_HEIGHT_SEGMENTS,
    CLUB_CONE_RADIUS,
    CLUB_CONE_RING_RADIUS,
    CLUB_CONE_SOURCE_HEIGHT,
    CLUB_CONE_SWEEP_ANGLE,
    CLUB_CONE_TILT,
    CLUB_FLASH_BASS_THRESHOLD,
    CLUB_FLASH_DECAY_SECONDS,
    CLUB_FLOOR_FADE_START,
    CLUB_FLOOR_FLASH_ACCENT,
    CLUB_FLOOR_FLASH_FLOOR,
    CLUB_FLOOR_LIFT,
    CLUB_FLOOR_RADIUS,
    CLUB_FOG_FAR,
    CLUB_FOG_NEAR,
    CLUB_LIGHT_COLORS,
    CLUB_MAX_FLASHES_PER_SECOND,
    CLUB_RIPPLE_GAIN,
    CLUB_RIPPLE_TRAVEL,
    CLUB_RIPPLE_WIDTH,
    CLUB_SPILL_BASE_INTENSITY,
    CLUB_SPILL_COLORS,
    CLUB_SPILL_FLASH_INTENSITY,
    CLUB_SWEEP_CALM_SPEED,
    CLUB_SWEEP_DANCE_SPEED,
    CLUB_TILE_BEAT_PULSE,
    CLUB_TILE_CHECKER,
    CLUB_TILE_FILL,
    CLUB_TILE_GRID,
    CLUB_TILE_IDLE,
    CLUB_TILE_PITCH,
    CLUB_TILE_SHIMMER,
    CLUB_TILE_SHIMMER_RATE,
} from './dancingCharacterConfig';

// ---- The flash limiter (pure, plain numbers) ----

export interface FlashLimiterState {
    // Seconds since the last flash started.
    sinceLast: number;
    // 0..1 brightness of the current flash: it jumps up only when a flash starts and otherwise decays smoothly.
    level: number;
}

export function createFlashLimiter(): FlashLimiterState {
    // Infinity so the very first trigger is allowed at once.
    return { sinceLast: Infinity, level: 0 };
}

// Advances the limiter by `dt` seconds. `trigger` is the bass level (0..1); a flash starts only when it reaches the
// threshold AND at least 1 / CLUB_MAX_FLASHES_PER_SECOND seconds have passed since the last one, so the rate is capped
// whatever the tempo or the bass does. Returns true on the frame a flash starts.
export function stepFlashLimiter(state: FlashLimiterState, trigger: number, dt: number): boolean {
    state.sinceLast += dt;
    state.level *= Math.exp(-dt / CLUB_FLASH_DECAY_SECONDS);
    if (trigger >= CLUB_FLASH_BASS_THRESHOLD && state.sinceLast >= 1 / CLUB_MAX_FLASHES_PER_SECOND) {
        state.sinceLast = 0;
        state.level = Math.max(state.level, Math.min(1, trigger));
        return true;
    }
    return false;
}

// ---- Pure shape functions ----

function smoothstep(edge0: number, edge1: number, x: number): number {
    const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
    return t * t * (3 - 2 * t);
}

// How much of the ripple ring shows at this beat phase: nothing at the start and the end of the beat, so the ring
// fades in at the center and out near the edge, and the wrap from one beat to the next never pops.
export function rippleEnvelope(beatPhase: number): number {
    return smoothstep(0, 0.1, beatPhase) * (1 - smoothstep(0.6, 1, beatPhase));
}

// Ring strength (0..1) at a normalized tile radius for a beat phase.
export function rippleAt(radius: number, beatPhase: number): number {
    const offset = (radius - beatPhase * CLUB_RIPPLE_TRAVEL) / CLUB_RIPPLE_WIDTH;
    return Math.exp(-offset * offset) * rippleEnvelope(beatPhase);
}

const LIGHT_COUNT = CLUB_LIGHT_COLORS.length;

// The club: a dark room (background and haze), an LED dance floor under the dancer, sweeping spotlight beams and two
// color-spill lights. The floor and the lights pulse to the beat and the bass, with a hard cap on large flashes.
export class ClubSet {
    private readonly scene: THREE.Scene;
    private readonly background = new THREE.Color(CLUB_BACKGROUND);
    private readonly fog = new THREE.Fog(CLUB_BACKGROUND, CLUB_FOG_NEAR, CLUB_FOG_FAR);

    private readonly tiles: THREE.InstancedMesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
    // Per tile, precomputed once: distance from the center as a fraction of the floor radius, the fade at the edge, the
    // checkerboard factor and a random offset for the idle shimmer.
    private readonly tileRadius: Float32Array;
    private readonly tileFade: Float32Array;
    private readonly tileChecker: Float32Array;
    private readonly tileSeed: Float32Array;

    private readonly coneGeometry: THREE.ConeGeometry;
    private readonly cones: THREE.Mesh<THREE.ConeGeometry, THREE.MeshBasicMaterial>[] = [];
    private readonly spill: THREE.PointLight[] = [];

    private readonly floorColor = new THREE.Color();
    private readonly accentColor = new THREE.Color();
    private readonly scratch = new THREE.Color();
    private readonly limiter = createFlashLimiter();
    private flashStrength = 1;
    private sweepPhase = 0;
    private time = 0;
    private disposed = false;

    constructor(scene: THREE.Scene) {
        this.scene = scene;
        scene.background = this.background;
        scene.fog = this.fog;

        // Tile positions on the grid, clipped to a circle so the floor has no corners to show.
        const half = (CLUB_TILE_GRID - 1) / 2;
        const positions: { x: number; z: number; parity: number }[] = [];
        for (let row = 0; row < CLUB_TILE_GRID; row++) {
            for (let column = 0; column < CLUB_TILE_GRID; column++) {
                const x = (column - half) * CLUB_TILE_PITCH;
                const z = (row - half) * CLUB_TILE_PITCH;
                if (Math.hypot(x, z) <= CLUB_FLOOR_RADIUS) positions.push({ x, z, parity: (row + column) % 2 });
            }
        }
        const count = positions.length;
        this.tileRadius = new Float32Array(count);
        this.tileFade = new Float32Array(count);
        this.tileChecker = new Float32Array(count);
        this.tileSeed = new Float32Array(count);

        const tileSize = CLUB_TILE_PITCH * CLUB_TILE_FILL;
        this.tiles = new THREE.InstancedMesh(
            new THREE.PlaneGeometry(tileSize, tileSize).rotateX(-Math.PI / 2),
            // White, so the per-instance color is the tile's color. Fog applies, which tints far tiles toward the haze.
            new THREE.MeshBasicMaterial(),
            count,
        );
        // The instances are spread over the floor and the camera looks at them from every side; culling by one
        // bounding sphere is not worth a mistake.
        this.tiles.frustumCulled = false;
        const matrix = new THREE.Matrix4();
        for (let i = 0; i < count; i++) {
            const { x, z, parity } = positions[i];
            matrix.makeTranslation(x, 0, z);
            this.tiles.setMatrixAt(i, matrix);
            const radius = Math.hypot(x, z) / CLUB_FLOOR_RADIUS;
            this.tileRadius[i] = radius;
            this.tileFade[i] = 1 - smoothstep(CLUB_FLOOR_FADE_START, 1, radius);
            this.tileChecker[i] = 1 + (parity === 0 ? CLUB_TILE_CHECKER : -CLUB_TILE_CHECKER);
            // A cheap, fixed pseudo-random offset per tile (fract of a sine), so the shimmer does not move in unison.
            const noise = Math.sin(i * 12.9898) * 43758.5453;
            this.tileSeed[i] = (noise - Math.floor(noise)) * Math.PI * 2;
        }
        this.tiles.instanceMatrix.needsUpdate = true;
        scene.add(this.tiles);

        // One open-ended slim cone with its apex (the light source) at the origin, pointing down; every spotlight
        // shares it. Vertex colors carry the fade along the beam: with additive blending a darker vertex adds less
        // light, so the beam is brightest at the source and gone before its far end.
        this.coneGeometry = new THREE.ConeGeometry(
            CLUB_CONE_RADIUS,
            CLUB_CONE_HEIGHT,
            16,
            CLUB_CONE_HEIGHT_SEGMENTS,
            true,
        ).translate(0, -CLUB_CONE_HEIGHT / 2, 0);
        const coneVertices = this.coneGeometry.getAttribute('position');
        const fade = new Float32Array(coneVertices.count * 3);
        for (let i = 0; i < coneVertices.count; i++) {
            const along = -coneVertices.getY(i) / CLUB_CONE_HEIGHT;
            const level = 1 - smoothstep(CLUB_CONE_FADE_START, CLUB_CONE_FADE_END, along);
            fade.fill(level, i * 3, i * 3 + 3);
        }
        this.coneGeometry.setAttribute('color', new THREE.BufferAttribute(fade, 3));
        for (let i = 0; i < LIGHT_COUNT; i++) {
            const cone = new THREE.Mesh(
                this.coneGeometry,
                new THREE.MeshBasicMaterial({
                    color: CLUB_LIGHT_COLORS[i],
                    vertexColors: true,
                    transparent: true,
                    opacity: CLUB_CONE_BASE_OPACITY,
                    blending: THREE.AdditiveBlending,
                    depthWrite: false,
                    side: THREE.DoubleSide,
                    // The haze would wash the beams toward the fog color; they should stay saturated.
                    fog: false,
                }),
            );
            // Euler order Y, X, Z: Y spins the tilt toward the middle, X is the lean and the sweep along the radius, and Z
            // is the sweep sideways.
            cone.rotation.order = 'YXZ';
            const angle = (i / LIGHT_COUNT) * Math.PI * 2;
            cone.userData.angle = angle;
            cone.rotation.y = Math.PI / 2 - angle;
            this.cones.push(cone);
            scene.add(cone);
        }
        for (const color of CLUB_SPILL_COLORS) {
            const light = new THREE.PointLight(color, CLUB_SPILL_BASE_INTENSITY, 0, 2);
            this.spill.push(light);
            scene.add(light);
        }

        this.setColors('#2b3a55', '#ff7ab6');
        this.setFloorY(0);
        this.update(undefined, 0, 0, 0);
    }

    // The number of floor tiles.
    get tileCount(): number {
        return this.tiles.count;
    }

    // The current flash brightness (0..1) after the strength setting, which drives the cones, lights and floor lift.
    get flashLevel(): number {
        return this.limiter.level * this.flashStrength;
    }

    // The y of the dancer's feet; the floor goes just above it and the lights hang above it.
    setFloorY(y: number): void {
        this.tiles.position.y = y + CLUB_FLOOR_LIFT;
        for (const cone of this.cones) {
            const angle = cone.userData.angle as number;
            cone.position.set(
                Math.cos(angle) * CLUB_CONE_RING_RADIUS,
                y + CLUB_CONE_SOURCE_HEIGHT,
                Math.sin(angle) * CLUB_CONE_RING_RADIUS,
            );
        }
        const [left, right] = this.spill;
        left.position.set(-2, y + 1.2, 2);
        right.position.set(2, y + 1.2, -1.5);
    }

    // The floor's resting color and the color of the beat ripple, as CSS colors (the settings' floor and accent).
    setColors(floor: string, accent: string): void {
        this.floorColor.set(floor);
        this.accentColor.set(accent);
    }

    // The floor's resting color alone, as a CSS color.
    setFloorColor(floor: string): void {
        this.floorColor.set(floor);
    }

    // The ripple's color, copied from a color the caller owns; cheap enough for every frame (the rainbow accent).
    setAccentColor(accent: THREE.Color): void {
        this.accentColor.copy(accent);
    }

    // 0..1, the share of the flash brightness that shows; reduced motion lowers it.
    setFlashStrength(value: number): void {
        this.flashStrength = Math.min(1, Math.max(0, value));
    }

    update(beatPhase: number | undefined, bassValue: number, danceWeight: number, dt: number): void {
        this.time += dt;
        stepFlashLimiter(this.limiter, bassValue, dt);
        const flash = this.limiter.level * this.flashStrength;
        const activity = Math.min(1, Math.max(0, danceWeight));
        // The ripple and the beat pulse need a known beat; without one the floor idles dimly.
        const beat = beatPhase === undefined ? undefined : beatPhase - Math.floor(beatPhase);
        const ripple = beat === undefined ? 0 : activity;
        const pulse =
            beat === undefined ? 0 : CLUB_TILE_BEAT_PULSE * activity * (0.5 + 0.5 * Math.cos(beat * Math.PI * 2));

        const floor = this.floorColor;
        const accent = this.accentColor;
        const background = this.background;
        const color = this.scratch;
        const shimmerTime = this.time * CLUB_TILE_SHIMMER_RATE;
        for (let i = 0; i < this.tiles.count; i++) {
            const fade = this.tileFade[i];
            const ring = beat === undefined ? 0 : rippleAt(this.tileRadius[i], beat) * ripple * CLUB_RIPPLE_GAIN;
            const rest =
                (CLUB_TILE_IDLE + CLUB_TILE_SHIMMER * Math.sin(shimmerTime + this.tileSeed[i]) + pulse) *
                this.tileChecker[i];
            const floorShare = rest + flash * CLUB_FLOOR_FLASH_FLOOR;
            const accentShare = ring + flash * CLUB_FLOOR_FLASH_ACCENT;
            // The edge fades to the background color itself, which is what hides the floor's edge from every angle.
            color.setRGB(
                (floor.r * floorShare + accent.r * accentShare) * fade + background.r * (1 - fade),
                (floor.g * floorShare + accent.g * accentShare) * fade + background.g * (1 - fade),
                (floor.b * floorShare + accent.b * accentShare) * fade + background.b * (1 - fade),
            );
            this.tiles.setColorAt(i, color);
        }
        if (this.tiles.instanceColor) this.tiles.instanceColor.needsUpdate = true;

        this.sweepPhase += dt * (CLUB_SWEEP_CALM_SPEED + CLUB_SWEEP_DANCE_SPEED * activity);
        const opacity = CLUB_CONE_BASE_OPACITY * (0.5 + 0.5 * activity) + flash * CLUB_CONE_FLASH_OPACITY;
        for (let i = 0; i < this.cones.length; i++) {
            const cone = this.cones[i];
            cone.rotation.x = CLUB_CONE_TILT + CLUB_CONE_SWEEP_ANGLE * Math.sin(this.sweepPhase + i * 1.7);
            cone.rotation.z = CLUB_CONE_SWEEP_ANGLE * Math.cos(this.sweepPhase * 0.8 + i * 2.3);
            cone.material.opacity = opacity;
        }
        for (const light of this.spill)
            light.intensity = CLUB_SPILL_BASE_INTENSITY + flash * CLUB_SPILL_FLASH_INTENSITY;
    }

    dispose(): void {
        if (this.disposed) return;
        this.disposed = true;
        this.tiles.geometry.dispose();
        this.tiles.material.dispose();
        this.tiles.dispose();
        this.coneGeometry.dispose();
        for (const cone of this.cones) cone.material.dispose();
        this.scene.remove(this.tiles, ...this.cones, ...this.spill);
        // Only clear what this set put there.
        if (this.scene.background === this.background) this.scene.background = null;
        if (this.scene.fog === this.fog) this.scene.fog = null;
    }
}
