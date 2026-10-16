import * as THREE from 'three';

// Frees the GPU memory held by everything in a scene. `scene.clear()` only detaches objects; the
// geometries, materials and textures stay on the GPU until they are disposed.
export function disposeScene(scene: THREE.Scene): void {
    scene.traverse(object => {
        if (object instanceof THREE.InstancedMesh) {
            object.dispose(); // frees the per-instance matrix/color buffers
        }

        const { geometry, material } = object as Partial<Pick<THREE.Mesh, 'geometry' | 'material'>>;
        geometry?.dispose();
        if (material) {
            (Array.isArray(material) ? material : [material]).forEach(disposeMaterial);
        }
    })

    // Neither is reached by traverse(): the environment map (e.g. a PMREM texture) and a textured background
    scene.environment?.dispose();
    if (scene.background instanceof THREE.Texture) {
        scene.background.dispose();
    }
}

function disposeMaterial(material: THREE.Material): void {
    for (const value of Object.values(material)) {
        if (value instanceof THREE.Texture) {
            value.dispose();
        }
    }
    material.dispose();
}