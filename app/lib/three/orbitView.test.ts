// @vitest-environment jsdom
import { PerspectiveCamera } from 'three';
import { describe, expect, it, vi } from 'vitest';
import { createOrbitView } from './orbitView';

const START_Z = 30;

function setup(options?: Parameters<typeof createOrbitView>[2]) {
    const camera = new PerspectiveCamera(50, 1, 1, 500);
    camera.position.set(0, 0, START_Z);
    const element = document.createElement('div');
    document.body.appendChild(element);
    const view = createOrbitView(camera, element, options);
    return { camera, element, view };
}

// A scroll of the mouse wheel is the simplest real input OrbitControls turns into a camera move (a dolly) and a
// 'change' event. Positive deltaY zooms out.
function scroll(element: HTMLElement, deltaY: number): void {
    element.dispatchEvent(new WheelEvent('wheel', { deltaY, bubbles: true, cancelable: true }));
}

describe('createOrbitView', () => {
    it('starts locked: input does not move the camera', () => {
        const onViewChanged = vi.fn();
        const { camera, element } = setup({ onViewChanged });

        scroll(element, 1000);

        expect(camera.position.z).toBe(START_Z);
        expect(onViewChanged).not.toHaveBeenCalled();
    });

    it('moves the camera and reports a changed view once it is unlocked and moved far enough', () => {
        const onViewChanged = vi.fn();
        const { camera, element, view } = setup({ onViewChanged });

        view.setLocked(false);
        scroll(element, 1000);

        expect(camera.position.z).toBeGreaterThan(START_Z);
        expect(onViewChanged).toHaveBeenCalledTimes(1);
        expect(onViewChanged).toHaveBeenCalledWith(true);
    });

    it('only reports the change once while the view stays changed', () => {
        const onViewChanged = vi.fn();
        const { element, view } = setup({ onViewChanged });
        view.setLocked(false);

        scroll(element, 1000);
        scroll(element, 1000);

        expect(onViewChanged).toHaveBeenCalledTimes(1);
    });

    it('does not report a change for a move under the threshold', () => {
        const onViewChanged = vi.fn();
        const camera = new PerspectiveCamera();
        // A wheel notch dollies by a fixed fraction of the distance, so a camera this close moves well under 0.5.
        camera.position.set(0, 0, 1);
        const element = document.createElement('div');
        createOrbitView(camera, element, { onViewChanged, locked: false });

        scroll(element, -1);

        expect(camera.position.z).toBeLessThan(1);
        expect(onViewChanged).not.toHaveBeenCalled();
    });

    it('can start unlocked', () => {
        const { camera, element } = setup({ locked: false });

        scroll(element, 1000);

        expect(camera.position.z).toBeGreaterThan(START_Z);
    });

    it('locks again with setLocked(true)', () => {
        const { camera, element, view } = setup({ locked: false });
        view.setLocked(true);

        scroll(element, 1000);

        expect(camera.position.z).toBe(START_Z);
    });

    it('reset puts the camera back and reports that the view is no longer changed', () => {
        const onViewChanged = vi.fn();
        const { camera, element, view } = setup({ locked: false, onViewChanged });
        scroll(element, 1000);
        expect(onViewChanged).toHaveBeenLastCalledWith(true);

        view.reset();

        expect(camera.position.z).toBeCloseTo(START_Z);
        expect(onViewChanged).toHaveBeenLastCalledWith(false);
        expect(onViewChanged).toHaveBeenCalledTimes(2);
    });

    it('reset on an untouched view reports nothing', () => {
        const onViewChanged = vi.fn();
        const { view } = setup({ onViewChanged });

        view.reset();

        expect(onViewChanged).not.toHaveBeenCalled();
    });

    it('works without an onViewChanged callback', () => {
        const { camera, element, view } = setup({ locked: false });

        expect(() => {
            scroll(element, 1000);
            view.reset();
        }).not.toThrow();
        expect(camera.position.z).toBeCloseTo(START_Z);
    });

    it('stops reacting to input after dispose', () => {
        const onViewChanged = vi.fn();
        const { camera, element, view } = setup({ locked: false, onViewChanged });

        view.dispose();
        scroll(element, 1000);

        expect(camera.position.z).toBe(START_Z);
        expect(onViewChanged).not.toHaveBeenCalled();
    });
});
