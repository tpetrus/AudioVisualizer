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
    CLUB_FLOOR_FLASH_LIFT,
    CLUB_FLOOR_HALF,
    CLUB_FLOOR_LIFT,
    CLUB_FOG_FAR,
    CLUB_FOG_NEAR,
    CLUB_FRAME_COLOR,
    CLUB_FRAME_HEIGHT,
    CLUB_FRAME_WIDTH,
    CLUB_LIGHT_COLORS,
    CLUB_MAX_FLASHES_PER_SECOND,
    CLUB_PATTERN_BEATS,
    CLUB_PATTERN_COUNT,
    CLUB_PATTERN_DRIFT,
    CLUB_PATTERN_FADE_SECONDS,
    CLUB_PATTERN_HUE_SPREAD,
    CLUB_PATTERN_SECONDS,
    CLUB_RIPPLE_GAIN,
    CLUB_RIPPLE_TRAVEL,
    CLUB_RIPPLE_WIDTH,
    CLUB_SEAM_COLOR,
    CLUB_SPILL_BASE_INTENSITY,
    CLUB_SPILL_COLORS,
    CLUB_SPILL_FLASH_INTENSITY,
    CLUB_SWEEP_CALM_SPEED,
    CLUB_SWEEP_DANCE_SPEED,
    CLUB_TILE_CALM_LEVEL,
    CLUB_TILE_DANCE_LEVEL,
    CLUB_TILE_FACET_FRONT,
    CLUB_TILE_FACET_SIDE,
    CLUB_TILE_FILL,
    CLUB_TILE_GRID,
    CLUB_TILE_LIGHTNESS,
    CLUB_TILE_PITCH,
    CLUB_TILE_SATURATION,
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

// Ring strength (0..1) at a normalized tile distance from the center for a beat phase.
export function rippleAt(radius: number, beatPhase: number): number {
    const offset = (radius - beatPhase * CLUB_RIPPLE_TRAVEL) / CLUB_RIPPLE_WIDTH;
    return Math.exp(-offset * offset) * rippleEnvelope(beatPhase);
}

// Where a tile is in the floor's color pattern, 0..1 around the color wheel (the caller wraps it). `u` and `v` are the
// tile's position across the floor (0..1), `square` its distance from the center (0 middle, 1 edge) and `parity` 0 or 1
// in a checkerboard; `drift` moves the pattern over time.
export function patternAt(
    pattern: number,
    u: number,
    v: number,
    square: number,
    parity: number,
    drift: number,
): number {
    switch (pattern) {
        case 0:
            // Diagonal rainbow bands, as on the reference floor.
            return ((u + v) / 2) * CLUB_PATTERN_HUE_SPREAD + drift;
        case 1:
            // Square rings from the middle, moving outward.
            return square * CLUB_PATTERN_HUE_SPREAD - drift;
        case 2:
            // Columns across the floor.
            return u * CLUB_PATTERN_HUE_SPREAD + drift;
        default:
            // A two-tone checkerboard, the two colors opposite on the wheel.
            return parity * 0.5 + drift;
    }
}

// One tile: four triangles (front, right, back, left facets) meeting at the center, with vertex colors that are full
// brightness at the center and dimmer at the edges, so a flat colored tile reads as a faceted LED diffuser. Lies in the
// XZ plane facing up.
function createTileGeometry(size: number): THREE.BufferGeometry {
    const s = size / 2;
    const front = CLUB_TILE_FACET_FRONT;
    const side = CLUB_TILE_FACET_SIDE;
    // Corners in the XY plane, counter-clockwise from the front facet; rotated to face up below.
    const facets: [number, number, number, number, number][] = [
        [-s, -s, s, -s, front],
        [s, -s, s, s, side],
        [s, s, -s, s, front],
        [-s, s, -s, -s, side],
    ];
    const positions = new Float32Array(facets.length * 9);
    const colors = new Float32Array(facets.length * 9);
    facets.forEach(([ax, ay, bx, by, edge], f) => {
        positions.set([ax, ay, 0, bx, by, 0, 0, 0, 0], f * 9);
        colors.set([edge, edge, edge, edge, edge, edge, 1, 1, 1], f * 9);
    });
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    return geometry.rotateX(-Math.PI / 2);
}

const LIGHT_COUNT = CLUB_LIGHT_COLORS.length;

// The club: a dark room (background and haze), a square LED dance floor in a light frame under the dancer, sweeping
// spotlight beams and two color-spill lights that take the floor's colors. The floor runs slowly changing color
// patterns, a ripple on each beat and a lift on the bass, with a hard cap on large flashes.
export class ClubSet {
    private readonly scene: THREE.Scene;
    private readonly background = new THREE.Color(CLUB_BACKGROUND);
    private readonly fog = new THREE.Fog(CLUB_BACKGROUND, CLUB_FOG_NEAR, CLUB_FOG_FAR);

    private readonly tiles: THREE.InstancedMesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>;
    // The frame: four bars (two full-width along x, two between them along z) sharing one unit box and one material.
    // Plain boxes rather than an extruded outline, which would pull three's shape triangulation into the bundle.
    private readonly frameGeometry = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
    private readonly frameMaterial = new THREE.MeshStandardMaterial({
        color: CLUB_FRAME_COLOR,
        roughness: 0.55,
        metalness: 0,
    });
    private readonly frame: THREE.Mesh<THREE.BoxGeometry, THREE.MeshStandardMaterial>[] = [];
    private readonly seams: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
    // Per tile, precomputed once: position across the floor (0..1 each way), distance from the center (0..1, square, so
    // the ripple and the ring pattern follow the floor's shape) and checkerboard parity.
    private readonly tileU: Float32Array;
    private readonly tileV: Float32Array;
    private readonly tileSquare: Float32Array;
    private readonly tileParity: Float32Array;

    private readonly coneGeometry: THREE.ConeGeometry;
    private readonly cones: THREE.Mesh<THREE.ConeGeometry, THREE.MeshBasicMaterial>[] = [];
    private readonly spill: THREE.PointLight[] = [];

    private readonly floorColor = new THREE.Color();
    private readonly accentColor = new THREE.Color();
    private readonly scratch = new THREE.Color();
    private readonly scratchNext = new THREE.Color();
    private readonly white = new THREE.Color(1, 1, 1);
    // Rainbow mode spreads the patterns over the color wheel starting at `hueOffset`; otherwise they blend between the
    // floor and accent colors.
    private rainbow = true;
    private hueOffset = 0;
    // The pattern showing, the one fading in, and how far the fade has come (1 = done).
    private pattern = 0;
    private nextPattern = 0;
    private patternBlend = 1;
    private beatsInPattern = 0;
    private secondsInPattern = 0;
    private lastBeat = 0;
    private readonly limiter = createFlashLimiter();
    private flashStrength = 1;
    private sweepPhase = 0;
    private time = 0;
    private disposed = false;

    constructor(scene: THREE.Scene) {
        this.scene = scene;
        scene.background = this.background;
        scene.fog = this.fog;

        // Every tile of the square grid, row by row.
        const count = CLUB_TILE_GRID * CLUB_TILE_GRID;
        this.tileU = new Float32Array(count);
        this.tileV = new Float32Array(count);
        this.tileSquare = new Float32Array(count);
        this.tileParity = new Float32Array(count);
        this.tiles = new THREE.InstancedMesh(
            createTileGeometry(CLUB_TILE_PITCH * CLUB_TILE_FILL),
            // The per-instance color times the facet shading is the tile's color. LEDs light themselves, so the material
            // is unlit; fog applies, which tints the far tiles toward the haze.
            new THREE.MeshBasicMaterial({ vertexColors: true }),
            count,
        );
        // The instances are spread over the floor and the camera looks at them from every side; culling by one
        // bounding sphere is not worth a mistake.
        this.tiles.frustumCulled = false;
        const matrix = new THREE.Matrix4();
        const half = (CLUB_TILE_GRID - 1) / 2;
        for (let row = 0; row < CLUB_TILE_GRID; row++) {
            for (let column = 0; column < CLUB_TILE_GRID; column++) {
                const i = row * CLUB_TILE_GRID + column;
                const x = (column - half) * CLUB_TILE_PITCH;
                const z = (row - half) * CLUB_TILE_PITCH;
                matrix.makeTranslation(x, 0, z);
                this.tiles.setMatrixAt(i, matrix);
                this.tileU[i] = column / (CLUB_TILE_GRID - 1);
                this.tileV[i] = row / (CLUB_TILE_GRID - 1);
                this.tileSquare[i] = Math.max(Math.abs(x), Math.abs(z)) / (half * CLUB_TILE_PITCH);
                this.tileParity[i] = (row + column) % 2;
            }
        }
        this.tiles.instanceMatrix.needsUpdate = true;
        scene.add(this.tiles);

        // A dark plane under the tiles, so the seams between them read as the floor's dark grid at any angle.
        this.seams = new THREE.Mesh(
            new THREE.PlaneGeometry(CLUB_FLOOR_HALF * 2, CLUB_FLOOR_HALF * 2).rotateX(-Math.PI / 2),
            new THREE.MeshBasicMaterial({ color: CLUB_SEAM_COLOR }),
        );
        scene.add(this.seams);

        // The frame is lit, so it picks up the spill lights' colors like the white edging of a real LED floor.
        const outer = (CLUB_FLOOR_HALF + CLUB_FRAME_WIDTH) * 2;
        const middle = CLUB_FLOOR_HALF + CLUB_FRAME_WIDTH / 2;
        const bars: [number, number, number, number][] = [
            [0, -middle, outer, CLUB_FRAME_WIDTH],
            [0, middle, outer, CLUB_FRAME_WIDTH],
            [-middle, 0, CLUB_FRAME_WIDTH, CLUB_FLOOR_HALF * 2],
            [middle, 0, CLUB_FRAME_WIDTH, CLUB_FLOOR_HALF * 2],
        ];
        for (const [x, z, width, depth] of bars) {
            const bar = new THREE.Mesh(this.frameGeometry, this.frameMaterial);
            bar.position.set(x, 0, z);
            bar.scale.set(width, CLUB_FRAME_HEIGHT, depth);
            this.frame.push(bar);
        }
        scene.add(...this.frame);

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
        this.seams.position.y = y + CLUB_FLOOR_LIFT / 2;
        for (const bar of this.frame) bar.position.y = y;
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

    // The accent color, copied from a color the caller owns; cheap enough for every frame (the rainbow accent).
    setAccentColor(accent: THREE.Color): void {
        this.accentColor.copy(accent);
    }

    // Rainbow mode (the default) colors the floor's patterns around the color wheel starting at `hueOffset` (0..1),
    // which the caller advances at the rainbow speed. Off, the patterns blend between the floor and accent colors.
    setRainbow(enabled: boolean, hueOffset: number): void {
        this.rainbow = enabled;
        this.hueOffset = hueOffset - Math.floor(hueOffset);
    }

    // The pattern showing (0..CLUB_PATTERN_COUNT - 1); exposed for tests.
    get currentPattern(): number {
        return this.patternBlend < 1 ? this.nextPattern : this.pattern;
    }

    // Writes the color of pattern `pattern` at tile `i` into `out`.
    private patternColor(pattern: number, i: number, drift: number, out: THREE.Color): THREE.Color {
        const place = patternAt(pattern, this.tileU[i], this.tileV[i], this.tileSquare[i], this.tileParity[i], drift);
        if (this.rainbow) {
            const hue = place + this.hueOffset;
            return out.setHSL(hue - Math.floor(hue), CLUB_TILE_SATURATION, CLUB_TILE_LIGHTNESS);
        }
        const mix = 0.5 + 0.5 * Math.cos(place * Math.PI * 2);
        return out.copy(this.floorColor).lerp(this.accentColor, mix);
    }

    // Counts beats (a wrap of the beat phase) or seconds, and starts a cross-fade to the next pattern when one is due.
    private stepPattern(beat: number | undefined, dt: number): void {
        if (this.patternBlend < 1) {
            this.patternBlend = Math.min(1, this.patternBlend + dt / CLUB_PATTERN_FADE_SECONDS);
            if (this.patternBlend >= 1) this.pattern = this.nextPattern;
        }
        this.secondsInPattern += dt;
        if (beat !== undefined) {
            if (beat < this.lastBeat - 0.5) this.beatsInPattern++;
            this.lastBeat = beat;
        }
        const due =
            beat === undefined
                ? this.secondsInPattern >= CLUB_PATTERN_SECONDS
                : this.beatsInPattern >= CLUB_PATTERN_BEATS;
        if (due && this.patternBlend >= 1) {
            this.nextPattern = (this.pattern + 1) % CLUB_PATTERN_COUNT;
            this.patternBlend = 0;
            this.beatsInPattern = 0;
            this.secondsInPattern = 0;
        }
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
        // The ripple needs a known beat; without one the floor only runs its patterns.
        const beat = beatPhase === undefined ? undefined : beatPhase - Math.floor(beatPhase);
        this.stepPattern(beat, dt);
        const level = CLUB_TILE_CALM_LEVEL + (CLUB_TILE_DANCE_LEVEL - CLUB_TILE_CALM_LEVEL) * activity;
        const drift = this.time * CLUB_PATTERN_DRIFT;
        const blend = this.patternBlend;
        const lift = flash * CLUB_FLOOR_FLASH_LIFT;
        const color = this.scratch;
        const next = this.scratchNext;
        for (let i = 0; i < this.tiles.count; i++) {
            this.patternColor(this.pattern, i, drift, color);
            if (blend < 1) color.lerp(this.patternColor(this.nextPattern, i, drift, next), blend);
            const ring = beat === undefined ? 0 : rippleAt(this.tileSquare[i], beat) * activity * CLUB_RIPPLE_GAIN;
            color.lerp(this.white, Math.min(1, ring + lift)).multiplyScalar(level);
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
        // The spill lights take two of the floor's colors, half the wheel apart, so the dancer is lit by the floor.
        for (let i = 0; i < this.spill.length; i++) {
            const light = this.spill[i];
            light.intensity = CLUB_SPILL_BASE_INTENSITY + flash * CLUB_SPILL_FLASH_INTENSITY;
            if (this.rainbow) {
                const hue = this.hueOffset + i * 0.5;
                light.color.setHSL(hue - Math.floor(hue), CLUB_TILE_SATURATION, CLUB_TILE_LIGHTNESS);
            } else {
                light.color.copy(i === 0 ? this.accentColor : this.floorColor);
            }
        }
    }

    dispose(): void {
        if (this.disposed) return;
        this.disposed = true;
        this.tiles.geometry.dispose();
        this.tiles.material.dispose();
        this.tiles.dispose();
        this.seams.geometry.dispose();
        this.seams.material.dispose();
        this.frameGeometry.dispose();
        this.frameMaterial.dispose();
        this.coneGeometry.dispose();
        for (const cone of this.cones) cone.material.dispose();
        this.scene.remove(this.tiles, this.seams, ...this.frame, ...this.cones, ...this.spill);
        // Only clear what this set put there.
        if (this.scene.background === this.background) this.scene.background = null;
        if (this.scene.fog === this.fog) this.scene.fog = null;
    }
}
