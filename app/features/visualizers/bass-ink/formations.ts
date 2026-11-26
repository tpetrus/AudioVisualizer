import { bassInkConfig, type FormationsConfig } from './bassInkConfig';
import { FORMATION_COUNT } from './bassInkTypes';

export const FORMATION_NAMES: readonly string[] = ['sphere', 'torus', 'armillary rings', 'galaxy disc'];

// Deterministic hash of (point, seed, salt) to [0, 1). A per-point hash instead of a sequential random generator means
// any slice of the cloud can be filled on its own, so filling in chunks over several frames gives the same points as
// filling all at once.
export function hash01(i: number, seed: number, salt: number): number {
    let h = Math.imul(i | 0, 0x9e3779b1) ^ Math.imul(seed | 0, 0x85ebca6b) ^ Math.imul(salt | 0, 0xc2b2ae35);
    h = Math.imul(h ^ (h >>> 16), 0x85ebca6b);
    h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
}

const TAU = Math.PI * 2;

// Writes xyz for points [start, end) of a cloud of `pointCount` into `out` (length pointCount * 3). Every formation is
// roughly unit radius so the scene can scale them alike.
export function writeFormation(
    index: number,
    seed: number,
    out: Float32Array,
    pointCount: number,
    start: number,
    end: number,
    config: FormationsConfig = bassInkConfig.formations,
): void {
    const kind = (((Math.trunc(index) % FORMATION_COUNT) + FORMATION_COUNT) % FORMATION_COUNT) as 0 | 1 | 2 | 3;
    for (let i = start; i < end; i++) {
        const o = i * 3;
        const a = hash01(i, seed, 1);
        const b = hash01(i, seed, 2);
        const c = hash01(i, seed, 3);
        switch (kind) {
            case 0: {
                // Uniform direction on the sphere (uniform height, uniform angle), pushed into a thick shell.
                const z = b * 2 - 1;
                const ring = Math.sqrt(1 - z * z);
                const angle = a * TAU;
                const radius = config.sphereInnerRadius + (1 - config.sphereInnerRadius) * c;
                out[o] = ring * Math.cos(angle) * radius;
                out[o + 1] = z * radius;
                out[o + 2] = ring * Math.sin(angle) * radius;
                break;
            }
            case 1: {
                const around = a * TAU;
                const tube = b * TAU;
                const tubeRadius = config.torusMinorRadius * Math.sqrt(c);
                const ring = config.torusMajorRadius + tubeRadius * Math.cos(tube);
                out[o] = ring * Math.cos(around);
                out[o + 1] = tubeRadius * Math.sin(tube);
                out[o + 2] = ring * Math.sin(around);
                break;
            }
            case 2: {
                // Three thin rings of dust in the three orthogonal planes, like an armillary sphere. The shape has the
                // same extent along every axis, so it reads as 3D from any orbit angle. The ring is chosen
                // by the point index, so the rings get equal shares and any slice of points still fills on its own.
                const ringIndex = i % 3;
                const around = a * TAU;
                const tube = b * TAU;
                const tubeRadius = config.armillaryTubeRadius * Math.sqrt(c);
                const inPlane = config.armillaryRadius + tubeRadius * Math.cos(tube);
                const u = inPlane * Math.cos(around);
                const v = inPlane * Math.sin(around);
                const n = tubeRadius * Math.sin(tube);
                // The ring's normal is x, y or z in turn; the other two coordinates run around the ring.
                out[o] = ringIndex === 0 ? n : u;
                out[o + 1] = ringIndex === 1 ? n : ringIndex === 0 ? u : v;
                out[o + 2] = ringIndex === 2 ? n : v;
                break;
            }
            default: {
                // Density falls off toward the rim (sqrt of a uniform number is uniform per area), arms wind with radius.
                // Most points sit in wide arms; the rest fill the disc between them, so it reads as a galaxy from across
                // a room rather than as two thin ribbons.
                const radius = Math.sqrt(a);
                const arm = Math.floor(b * config.discArms);
                const inArm = hash01(i, seed, 5) < config.discArmShare;
                const spread = inArm ? config.discArmSpread * (1.2 - 0.6 * radius) : TAU;
                const angle = radius * config.discTwist + (arm / config.discArms) * TAU + (c - 0.5) * spread;
                out[o] = radius * Math.cos(angle);
                out[o + 1] = (hash01(i, seed, 4) - 0.5) * config.discThickness;
                out[o + 2] = radius * Math.sin(angle);
                break;
            }
        }
    }
}
