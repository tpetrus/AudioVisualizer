import { type RefObject, useCallback, useRef } from 'react';
import * as THREE from 'three';
import { BANDS } from './trioColorWaveConfig';
import { TrioColorWaveSheet } from './trioColorWaveSheet';
import type { TrioColorWaveControlValues } from './trioColorWaveControls';
import { useLatestRef } from '~/hooks/useLatestRef';
import useThreeScene from '~/hooks/useThreeScene';
import createOrbitView from '~/lib/three/orbitView';

// A narrow field of view from far away flattens the perspective, so the sheets read like a 2D stack.
const CAMERA_FOV = 10;
const CAMERA_DISTANCE = 3800;

interface TrioColorWaveSceneOptions {
    analyser: AnalyserNode | undefined;
    valuesRef: { readonly current: TrioColorWaveControlValues };
    // Locked means the picture can't be dragged, rotated or zoomed.
    cameraLocked: boolean;
    onViewChanged: (changed: boolean) => void;
}

// Three sheets of pencil bars, one per band: highs in front, then mids, then bass at the back.
export function useTrioColorWaveScene(
    containerRef: RefObject<HTMLElement | null>,
    { analyser, valuesRef, cameraLocked, onViewChanged }: TrioColorWaveSceneOptions,
): { resetView: () => void } {
    // The scene is built once; it reads these through refs so it always sees the current values.
    const analyserRef = useLatestRef(analyser);
    const cameraLockedRef = useLatestRef(cameraLocked);
    const onViewChangedRef = useLatestRef(onViewChanged);
    const resetViewRef = useRef<() => void>(() => { });

    useThreeScene(containerRef, ({ scene, renderer, size }) => {
        renderer.physicallyCorrectLights = true;
        renderer.toneMapping = THREE.ACESFilmicToneMapping;
        scene.background = new THREE.Color(0x000000);

        const sheets = BANDS.map((band, index) => new TrioColorWaveSheet(band, index, BANDS.length));
        sheets.forEach(sheet => scene.add(sheet.flags.mesh));

        const camera = new THREE.PerspectiveCamera(CAMERA_FOV, size.width / size.height, 1, 5000);
        // Straight in front of the middle of the sheets, so the view is symmetrical and the bottom edge of the screen is
        // at the same height all the way across.
        camera.position.set(0, 0, CAMERA_DISTANCE);

        const orbit = createOrbitView(camera, renderer.domElement, {
            locked: cameraLockedRef.current,
            onViewChanged: changed => onViewChangedRef.current(changed),
        });
        resetViewRef.current = orbit.reset;

        let boundAnalyser: AnalyserNode | undefined;

        return {
            camera,

            update: () => {
                const values = valuesRef.current;
                orbit.setLocked(cameraLockedRef.current);

                // A new source: keep the scene and give each sheet a fresh analyser tapped from it.
                const source = analyserRef.current;
                if (source && source !== boundAnalyser) {
                    sheets.forEach(sheet => sheet.connect(source));
                    boundAnalyser = source;
                }

                for (const sheet of sheets) {
                    sheet.place(values.moveX, values.moveY);
                    sheet.update(values);
                }
            },

            dispose: () => {
                orbit.dispose();
                sheets.forEach(sheet => sheet.dispose());
            },
        };
    });

    const resetView = useCallback(() => resetViewRef.current(), []);
    return { resetView };
}
