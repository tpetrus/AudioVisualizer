import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import { CubeGrid, gridSizeForView, type CubeLook } from './cubeGrid';

const LOOK: CubeLook = {
    depth: 4,
    spin: 0.005,
    restingColor: new THREE.Color(1, 0, 0),
    raisedColor: new THREE.Color(0, 0, 1),
    backdropLift: 0.5,
};

const matrix = new THREE.Matrix4();
const position = new THREE.Vector3();
const euler = new THREE.Euler();
const quaternion = new THREE.Quaternion();
const scale = new THREE.Vector3();

function positionOf(grid: CubeGrid, x: number, y: number): THREE.Vector3 {
    grid.mesh.getMatrixAt(x * grid.rows + y, matrix);
    return position.setFromMatrixPosition(matrix).clone();
}

function rotationOf(grid: CubeGrid, x: number, y: number): THREE.Euler {
    grid.mesh.getMatrixAt(x * grid.rows + y, matrix);
    // Decompose first: resting cubes are scaled down, and Euler angles can't be read from a scaled matrix.
    matrix.decompose(position, quaternion, scale);
    return euler.setFromQuaternion(quaternion, 'XYZ').clone();
}

function colorOf(grid: CubeGrid, x: number, y: number): THREE.Color {
    const colors = grid.mesh.instanceColor;
    if (!colors) throw new Error('instance colours missing');
    return new THREE.Color().fromBufferAttribute(colors, x * grid.rows + y);
}

describe('gridSizeForView', () => {
    it('covers the visible height plus a margin of two', () => {
        // A 90 degree field of view at distance 5 sees 10 units; the aspect ratio widens it.
        expect(gridSizeForView(90, 5, 1)).toEqual({ rows: 12, columns: 12 });
        expect(gridSizeForView(90, 5, 2)).toEqual({ rows: 12, columns: 22 });
    });

    it('grows with distance and a wider field of view, and rounds partial cells up', () => {
        const near = gridSizeForView(60, 10, 1.5);
        expect(gridSizeForView(60, 20, 1.5).rows).toBeGreaterThan(near.rows);
        expect(gridSizeForView(90, 10, 1.5).rows).toBeGreaterThan(near.rows);
        const visibleHeight = 2 * 10 * Math.tan(Math.PI / 6);
        expect(near.rows).toBe(Math.ceil(visibleHeight) + 2);
    });
});

describe('CubeGrid', () => {
    it('builds one instance per cell with a per-instance colour', () => {
        const grid = new CubeGrid({ columns: 5, rows: 3 });
        expect(grid.mesh.count).toBe(15);
        expect(grid.mesh.instanceColor).not.toBeNull();
        expect(grid.mesh.frustumCulled).toBe(false);
        expect(grid.mesh.instanceMatrix.usage).toBe(THREE.DynamicDrawUsage);
        expect(grid.columns).toBe(5);
        expect(grid.rows).toBe(3);
    });

    it('shows one band per column from the centre outward', () => {
        expect(new CubeGrid({ columns: 5, rows: 3 }).bandCount).toBe(3);
        expect(new CubeGrid({ columns: 6, rows: 3 }).bandCount).toBe(3);
    });

    it('flags both buffers for upload after an update', () => {
        const grid = new CubeGrid({ columns: 3, rows: 3 });
        const matrixVersion = grid.mesh.instanceMatrix.version;
        const colorVersion = grid.mesh.instanceColor?.version ?? 0;
        grid.update(new Float32Array(2), LOOK);
        expect(grid.mesh.instanceMatrix.version).toBeGreaterThan(matrixVersion);
        expect(grid.mesh.instanceColor?.version ?? 0).toBeGreaterThan(colorVersion);
    });

    it('centres the grid on the origin and lifts resting cubes by the backdrop amount', () => {
        const grid = new CubeGrid({ columns: 3, rows: 3 });
        grid.update(new Float32Array(2), LOOK);

        // Off-centre cells are at rest: laid out around the middle, at the backdrop lift.
        expect(positionOf(grid, 0, 0).toArray()).toEqual([-1, -1, 0.5].map((value) => expect.closeTo(value, 5)));
        expect(positionOf(grid, 2, 2).toArray()).toEqual([1, 1, 0.5].map((value) => expect.closeTo(value, 5)));
    });

    it('raises the middle of a column to full depth when its band is loud, and fills outward like a meter', () => {
        const grid = new CubeGrid({ columns: 3, rows: 3 });
        // Band 0 is the centre column, band 1 the outer columns.
        grid.update(Float32Array.from([1, 0]), LOOK);

        for (let y = 0; y < 3; y++) {
            expect(positionOf(grid, 1, y).z).toBeCloseTo(LOOK.depth, 5);
        }
        // The outer columns are silent: only their middle cell is raised.
        expect(positionOf(grid, 0, 1).z).toBeCloseTo(LOOK.depth, 5);
        expect(positionOf(grid, 0, 0).z).toBeCloseTo(LOOK.backdropLift, 5);
        expect(positionOf(grid, 2, 2).z).toBeCloseTo(LOOK.backdropLift, 5);
    });

    it('mirrors the spectrum around the centre column', () => {
        const grid = new CubeGrid({ columns: 5, rows: 3 });
        grid.update(Float32Array.from([0, 1, 0.5]), LOOK);
        for (let y = 0; y < 3; y++) {
            expect(positionOf(grid, 1, y).z).toBeCloseTo(positionOf(grid, 3, y).z, 5);
            expect(positionOf(grid, 0, y).z).toBeCloseTo(positionOf(grid, 4, y).z, 5);
        }
    });

    it('tilts and enlarges raised cubes', () => {
        const grid = new CubeGrid({ columns: 3, rows: 3 });
        grid.update(Float32Array.from([1, 0]), { ...LOOK, spin: 0 });

        grid.mesh.getMatrixAt(1 * 3 + 0, matrix);
        expect(new THREE.Vector3().setFromMatrixScale(matrix).x).toBeCloseTo(1, 5);
        expect(rotationOf(grid, 1, 0).x).toBeCloseTo(-0.55, 4);
        expect(rotationOf(grid, 1, 0).y).toBeCloseTo(0.7, 4);

        grid.mesh.getMatrixAt(0 * 3 + 0, matrix);
        expect(new THREE.Vector3().setFromMatrixScale(matrix).x).toBeCloseTo(0.85, 5);
        expect(rotationOf(grid, 0, 0).x).toBeCloseTo(0, 5);
    });

    it('colours resting cubes dimmed and raised cubes in the raised colour', () => {
        const grid = new CubeGrid({ columns: 3, rows: 3 });
        grid.update(Float32Array.from([1, 0]), LOOK);

        const resting = colorOf(grid, 0, 0);
        expect(resting.r).toBeCloseTo(0.4, 5);
        expect(resting.b).toBeCloseTo(0, 5);
        const raised = colorOf(grid, 1, 1);
        expect(raised.r).toBeCloseTo(0, 5);
        expect(raised.b).toBeCloseTo(1, 5);
    });

    it('spins raised cubes and eases them back to the nearest full turn once they drop', () => {
        const grid = new CubeGrid({ columns: 3, rows: 3 });
        grid.update(Float32Array.from([1, 0]), LOOK);
        const spun = rotationOf(grid, 1, 0).y;
        // 0.7 for the tilt plus spin * 70 * level^3 = 0.35.
        expect(spun).toBeCloseTo(0.7 + 0.35, 4);

        // The column goes quiet: the tilt goes away at once and the spin angle decays by 10% a frame toward 0.
        grid.update(Float32Array.from([0, 0]), LOOK);
        expect(rotationOf(grid, 1, 0).y).toBeCloseTo(0.35 * 0.9, 4);
        grid.update(Float32Array.from([0, 0]), LOOK);
        expect(rotationOf(grid, 1, 0).y).toBeCloseTo(0.35 * 0.81, 4);
    });

    it('does not spin faster than the level allows (the level is capped at 1)', () => {
        const grid = new CubeGrid({ columns: 3, rows: 3 });
        grid.update(Float32Array.from([5, 0]), LOOK);
        expect(rotationOf(grid, 1, 0).y).toBeCloseTo(0.7 + 0.35, 4);
    });

    it('detaches the mesh and frees its geometry, material and instance buffers on dispose', () => {
        const grid = new CubeGrid({ columns: 3, rows: 3 });
        const scene = new THREE.Scene();
        scene.add(grid.mesh);
        const geometry = vi.spyOn(grid.mesh.geometry, 'dispose');
        const material = vi.spyOn(grid.mesh.material as THREE.Material, 'dispose');
        const instances = vi.fn();
        grid.mesh.addEventListener('dispose', instances);

        grid.dispose();

        expect(scene.children).toHaveLength(0);
        expect(geometry).toHaveBeenCalledTimes(1);
        expect(material).toHaveBeenCalledTimes(1);
        expect(instances).toHaveBeenCalledTimes(1);
    });
});
