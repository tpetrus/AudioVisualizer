import { bassInkConfig, type FormationsConfig } from './bassInkConfig';
import { FORMATION_COUNT } from './bassInkTypes';

export const FORMATION_NAMES: readonly string[] = ['sphere', 'torus', 'double helix', 'galaxy disc'];

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
                // Two strands half a turn apart, with some scatter so they read as tubes of dust, not wires.
                const along = a * 2 - 1;
                const strand = i % 2;
                const angle = along * config.helixTurns * TAU + strand * Math.PI;
                const radius = config.helixRadius * (0.8 + 0.4 * b);
                out[o] = radius * Math.cos(angle) + (c - 0.5) * 0.12;
                out[o + 1] = along * config.helixHalfHeight;
                out[o + 2] = radius * Math.sin(angle) + (hash01(i, seed, 4) - 0.5) * 0.12;
                break;
            }
            default: {
                // Density falls off toward the rim (sqrt of a uniform number is uniform per area), arms wind with radius.
                const radius = Math.sqrt(a);
                const arm = Math.floor(b * config.discArms);
                const angle =
                    radius * config.discTwist + (arm / config.discArms) * TAU + (c - 0.5) * 0.5 * (1 - radius);
                out[o] = radius * Math.cos(angle);
                out[o + 1] = (hash01(i, seed, 4) - 0.5) * config.discThickness;
                out[o + 2] = radius * Math.sin(angle);
                break;
            }
        }
    }
}
