import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import { disposeScene } from './disposeScene';

describe('disposeScene', () => {
    it('disposes a mesh geometry and material once each', () => {
        const scene = new THREE.Scene();
        const mesh = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial());
        scene.add(mesh);
        const geometry = vi.spyOn(mesh.geometry, 'dispose');
        const material = vi.spyOn(mesh.material as THREE.Material, 'dispose');

        disposeScene(scene);

        expect(geometry).toHaveBeenCalledTimes(1);
        expect(material).toHaveBeenCalledTimes(1);
    });

    it('disposes every material of a multi-material mesh', () => {
        const scene = new THREE.Scene();
        const materials = [new THREE.MeshBasicMaterial(), new THREE.MeshBasicMaterial()];
        scene.add(new THREE.Mesh(new THREE.BoxGeometry(), materials));
        const spies = materials.map(material => vi.spyOn(material, 'dispose'));

        disposeScene(scene);

        spies.forEach(spy => expect(spy).toHaveBeenCalledTimes(1));
    });

    it('disposes textures held by a material', () => {
        const scene = new THREE.Scene();
        const map = new THREE.Texture();
        const material = new THREE.MeshBasicMaterial({ map });
        scene.add(new THREE.Mesh(new THREE.BoxGeometry(), material));
        const texture = vi.spyOn(map, 'dispose');

        disposeScene(scene);

        expect(texture).toHaveBeenCalledTimes(1);
    });

    it('frees the per-instance buffers of an instanced mesh', () => {
        const scene = new THREE.Scene();
        const instanced = new THREE.InstancedMesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial(), 4);
        scene.add(instanced);
        const onDispose = vi.fn();
        instanced.addEventListener('dispose', onDispose);

        disposeScene(scene);

        expect(onDispose).toHaveBeenCalledTimes(1);
    });

    it('walks nested objects and skips ones without geometry', () => {
        const scene = new THREE.Scene();
        const group = new THREE.Group();
        const child = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial());
        group.add(child, new THREE.Object3D());
        scene.add(group);
        const geometry = vi.spyOn(child.geometry, 'dispose');

        expect(() => disposeScene(scene)).not.toThrow();
        expect(geometry).toHaveBeenCalledTimes(1);
    });

    it('disposes the environment map and a textured background, which traverse() does not reach', () => {
        const scene = new THREE.Scene();
        scene.environment = new THREE.Texture();
        scene.background = new THREE.Texture();
        const environment = vi.spyOn(scene.environment, 'dispose');
        const background = vi.spyOn(scene.background, 'dispose');

        disposeScene(scene);

        expect(environment).toHaveBeenCalledTimes(1);
        expect(background).toHaveBeenCalledTimes(1);
    });

    it('leaves a plain colour background alone and accepts an empty scene', () => {
        const scene = new THREE.Scene();
        scene.background = new THREE.Color(0x123456);

        expect(() => disposeScene(scene)).not.toThrow();
        expect(scene.background).toBeInstanceOf(THREE.Color);
    });
});
