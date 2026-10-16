import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

// How far (in world units) camera or its target must move before the view counts as changed.
const MOVED_THRESHOLD = 0.5;

export interface OrbitView {
    setLocked(locked: boolean): void; // Picture can't be dragged, rotated or zoomed.
    reset(): void; // Puts camera back where it started.
    dispose(): void;
}

interface OrbitViewOptions {
    locked?: boolean;
    onViewChanged?: (changed: boolean) => void;
}

// Orbit controls that remember starting view (shared by visualizers' lock and reset-view buttons).
// ** Position camera before calling this: its current position becomes view that reset() returns to. **
export function createOrbitView(camera: THREE.Camera, domElement: HTMLElement, { locked = true, onViewChanged }: OrbitViewOptions = {}): OrbitView {
    const controls = new OrbitControls(camera, domElement);
    controls.enabled = !locked;

    const defaultPosition = camera.position.clone();
    const defaultTarget = controls.target.clone();
    let changed = false;

    const setChanged = (next: boolean) => {
        if (next !== changed) {
            changed = next;
            onViewChanged?.(next);
        }
    }

    const onChange = () => setChanged(
        camera.position.distanceTo(defaultPosition) > MOVED_THRESHOLD || controls.target.distanceTo(defaultTarget) > MOVED_THRESHOLD
    )

    controls.addEventListener('change', onChange);

    function setLocked(isLocked: boolean) {
        controls.enabled = !isLocked;
    }

    function reset() {
        camera.position.copy(defaultPosition);
        controls.target.copy(defaultTarget);
        controls.update();
        setChanged(false);
    }

    function dispose() {
        controls.removeEventListener('change', onChange);
        controls.dispose();
    }

    return {
        setLocked,
        reset,
        dispose
    }
}