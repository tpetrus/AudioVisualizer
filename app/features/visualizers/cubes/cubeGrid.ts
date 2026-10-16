import * as THREE from 'three';

// Brightness of a resting cube's color relative to the chosen background-cube color.
const RESTING_BRIGHTNESS = 0.4;

const TURN = Math.PI * 2;
// Extra rows/columns beyond the visible area, so the edges never show while cubes tilt.
const GRID_MARGIN = 2;

export interface GridSize {
    columns: number;
    rows: number;
}

export interface CubeLook {
    depth: number;             // how far a fully raised cube moves toward the camera
    spin: number;              // spin speed while raised
    restingColor: THREE.Color; // resting cubes show a dimmed version of this
    raisedColor: THREE.Color;  // color of a fully raised cube
    backdropLift: number;      // how far resting cubes rise toward the viewer (bass bump)
}

// Covers the view at the grid's depth (plus a margin), whatever the window's shape.
export function gridSizeForView(fovDegrees: number, distance: number, aspect: number): GridSize {
    const visibleHeight = 2 * distance * Math.tan(THREE.MathUtils.degToRad(fovDegrees / 2));
    return {
        rows: Math.ceil(visibleHeight) + GRID_MARGIN,
        columns: Math.ceil(visibleHeight * aspect) + GRID_MARGIN,
    };
}

// A grid of glass cubes, drawn as one instanced mesh. The spectrum is mirrored around the center column:
// bass in the middle, treble at the edges.
export class CubeGrid {
    public readonly mesh: THREE.InstancedMesh;
    public readonly columns: number;
    public readonly rows: number;

    private readonly geometry = new THREE.BoxGeometry(1, 1, 1);
    private readonly material: THREE.MeshPhysicalMaterial;
    private readonly colors: THREE.InstancedBufferAttribute;
    // How far each cube has turned about its vertical axis.
    private readonly spinAngles: Float32Array;
    private readonly dummy = new THREE.Object3D();
    private readonly cubeColor = new THREE.Color();
    private readonly dimmedRestingColor = new THREE.Color();

    constructor({ columns, rows }: GridSize) {
        this.columns = columns;
        this.rows = rows;
        const count = columns * rows;

        // Glass: a smooth, clear-coated, partly transparent surface that mirrors the scene's environment.
        // Back faces are drawn too, and nothing writes depth, so overlapping cubes show through each other.
        this.material = new THREE.MeshPhysicalMaterial({
            color: 0xffffff,
            metalness: 0.5,
            roughness: 0,
            clearcoat: 1,
            clearcoatRoughness: 0,
            ior: 1.3,
            envMapIntensity: 1.4,
            transparent: true,
            opacity: 0.8,
            side: THREE.DoubleSide,
            depthWrite: false,
        });

        this.mesh = new THREE.InstancedMesh(this.geometry, this.material, count);
        this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        // Cubes brighten as they move forward, so each one carries its own color.
        this.colors = new THREE.InstancedBufferAttribute(new Float32Array(count * 3), 3);
        this.colors.setUsage(THREE.DynamicDrawUsage);
        this.mesh.instanceColor = this.colors;
        // Instances move every frame, so the geometry's own bounds can't be used for culling.
        this.mesh.frustumCulled = false;

        this.spinAngles = new Float32Array(count);
    }

    // How many frequency bands the grid shows (one per column from the center outward).
    public get bandCount(): number {
        return Math.ceil(this.columns / 2);
    }

    // Raises, turns and colors every cube from its column's band level.
    public update(levels: Float32Array, { depth, spin, restingColor, raisedColor, backdropLift }: CubeLook): void {
        this.dimmedRestingColor.copy(restingColor).multiplyScalar(RESTING_BRIGHTNESS);
        const centerColumn = (this.columns - 1) / 2;
        const centerRow = (this.rows - 1) / 2;
        const reach = centerRow + 1;

        for (let x = 0; x < this.columns; x++) {
            const level = levels[Math.floor(Math.abs(x - centerColumn))];
            for (let y = 0; y < this.rows; y++) {
                // Each column fills outward from its middle like a level meter; the edge of the fill eases in.
                const distance = Math.abs(y - centerRow);
                const raw = Math.min(1, Math.max(0, level * reach - distance + 1));
                const active = raw * raw * (3 - 2 * raw);

                const index = x * this.rows + y;
                this.dummy.position.set(x - centerColumn, y - centerRow, active * depth + (1 - active) * backdropLift);
                this.dummy.scale.setScalar(0.85 + 0.15 * active);
                // Raised cubes turn to show their top and side, which is what gives them shading.
                // They also spin slowly while lifted, and ease back to the nearest full turn once they drop.
                if (active > 0.05) {
                    this.spinAngles[index] += spin * 70 * Math.pow(Math.min(1, level), 3);
                } else {
                    this.spinAngles[index] += (Math.round(this.spinAngles[index] / TURN) * TURN - this.spinAngles[index]) * 0.1;
                }
                this.dummy.rotation.set(-0.55 * active, 0.7 * active + this.spinAngles[index], 0);
                this.dummy.updateMatrix();
                this.mesh.setMatrixAt(index, this.dummy.matrix);

                this.cubeColor.copy(this.dimmedRestingColor).lerp(raisedColor, active);
                this.mesh.setColorAt(index, this.cubeColor);
            }
        }
        this.mesh.instanceMatrix.needsUpdate = true;
        this.colors.needsUpdate = true;
    }

    public dispose(): void {
        this.mesh.removeFromParent();
        this.mesh.dispose();
        this.geometry.dispose();
        this.material.dispose();
    }
}