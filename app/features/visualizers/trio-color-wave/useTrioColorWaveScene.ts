import { type RefObject, useCallback, useRef } from 'react';
import * as THREE from 'three';
import { BANDS } from './trioColorWaveConfig';
import { TrioColorWaveSheet } from './trioColorWaveSheet';
import type { TrioAllControlValues } from './trioLookControls';
import { isHardwareForced, resolveTrioLookMode } from './trioLookMode';
import type { CreateTrioEnhancedLook, ReducedMotionSource, TrioEnhancedLook } from './enhanced/trioEnhancedTypes';
import type { EnhancedGraphicsStatus } from '~/components/EnhancedGraphicsToggle/EnhancedGraphicsToggle';
import { getEnhancedGraphics, subscribeEnhancedGraphics } from '~/features/settings/enhancedGraphicsStore';
import type { RhythmTracker } from '~/features/rhythm/rhythmTracker';
import { isSoftwareRenderer } from '~/lib/three/renderBudget';
import { useLatestRef } from '~/hooks/useLatestRef';
import { useThreeScene } from '~/hooks/useThreeScene';
import { registerTelemetryProbe, tickTelemetry } from '~/features/audio/devTelemetry';
import { createOrbitView } from '~/lib/three/orbitView';

// A narrow field of view from far away flattens the perspective, so the sheets read like a 2D stack.
const CAMERA_FOV = 10;
const CAMERA_DISTANCE = 3800;

// How long the enhanced look takes to fade in over the standard one, and back out again.
const FADE_SECONDS = 0.25;
// The longest frame time one fade step may use. The first frames through the look compile its shaders and can take a
// few hundred milliseconds on a real GPU, which would otherwise finish the whole fade in one step.
const MAX_FADE_STEP_SECONDS = 0.1;

interface EnhancedLookModule {
    createTrioEnhancedLook: CreateTrioEnhancedLook;
}

// The only place that names the lazy chunk, so Vite splits it out and standard mode never fetches it.
const loadDefaultLook = (): Promise<EnhancedLookModule> => import('./enhanced/trioEnhancedLook');

// Standard: the plain sheets. Loading: the chunk is on its way. Enhanced: the look is live (mixing in, or fully on).
// Fading-out: the look is live but mixing out; turning the preference back on reuses it.
type LookState = 'standard' | 'loading' | 'enhanced' | 'fading-out';

interface TrioColorWaveSceneOptions {
    analyser: AnalyserNode | undefined;
    // The whole trio table (standard and Look keys); the standard path only reads its own keys.
    valuesRef: { readonly current: TrioAllControlValues };
    // The app-wide tracker. The standard path ignores it; the enhanced look reads beats and kick onsets from it.
    rhythm?: RhythmTracker;
    // Called when the enhanced look's progress changes (never per frame): undefined while standard.
    onEnhancedStatus?: (status: EnhancedGraphicsStatus | undefined) => void;
    // A test seam for the lazy chunk; the page never passes it.
    loadEnhancedLook?: () => Promise<EnhancedLookModule>;
    // Locked means the picture can't be dragged, rotated or zoomed.
    cameraLocked: boolean;
    onViewChanged: (changed: boolean) => void;
}

// Three sheets of pencil bars, one per band: highs in front, then mids, then bass at the back.
export function useTrioColorWaveScene(
    containerRef: RefObject<HTMLElement | null>,
    {
        analyser,
        valuesRef,
        rhythm,
        onEnhancedStatus,
        loadEnhancedLook = loadDefaultLook,
        cameraLocked,
        onViewChanged,
    }: TrioColorWaveSceneOptions,
): { resetView: () => void } {
    // The scene is built once; it reads these through refs so it always sees the current values.
    const analyserRef = useLatestRef(analyser);
    const cameraLockedRef = useLatestRef(cameraLocked);
    const onViewChangedRef = useLatestRef(onViewChanged);
    const onEnhancedStatusRef = useLatestRef(onEnhancedStatus);
    const loadEnhancedLookRef = useLatestRef(loadEnhancedLook);
    const resetViewRef = useRef<() => void>(() => {});

    useThreeScene(containerRef, ({ scene, renderer, size }) => {
        renderer.toneMapping = THREE.ACESFilmicToneMapping;
        scene.background = new THREE.Color(0x000000);

        const sheets = BANDS.map((band, index) => new TrioColorWaveSheet(band, index, BANDS.length));
        sheets.forEach((sheet) => scene.add(sheet.flags.mesh));

        const camera = new THREE.PerspectiveCamera(CAMERA_FOV, size.width / size.height, 1, 5000);
        // Straight in front of the middle of the sheets, so the view is symmetrical and the bottom edge of the screen is
        // at the same height all the way across.
        camera.position.set(0, 0, CAMERA_DISTANCE);

        const orbit = createOrbitView(camera, renderer.domElement, {
            locked: cameraLockedRef.current,
            onViewChanged: (changed) => onViewChangedRef.current(changed),
        });
        resetViewRef.current = orbit.reset;

        let boundAnalyser: AnalyserNode | undefined;

        // DEV only: the bass sheet is the last one, at the back.
        let unregisterProbe: (() => void) | undefined;
        if (import.meta.env.DEV) {
            const bassSheet = sheets[sheets.length - 1];
            unregisterProbe = registerTelemetryProbe('trio-color-wave', ['in', 'peak', 'out'], (out) => {
                out[0] = bassSheet.frameLevel;
                out[1] = bassSheet.peak;
                out[2] = bassSheet.balancedLevel;
            });
        }

        // The enhanced look is switched on and off inside this one scene (no rebuild, so the camera and the sheets stay),
        // driven by the preference store. None of it lives in React state or in the useThreeScene deps.
        const software = isSoftwareRenderer(renderer) && !isHardwareForced();
        const reducedMotion: ReducedMotionSource =
            typeof window.matchMedia === 'function'
                ? window.matchMedia('(prefers-reduced-motion: reduce)')
                : { matches: false };
        let state: LookState = 'standard';
        let look: TrioEnhancedLook | undefined;
        let mix = 0;
        let mixTarget = 0;
        let currentSize = size;
        // After a failure the status stays 'error' until the preference is turned off, so the next toggle retries.
        let failed = false;
        let contextLost = false;
        let lastDeltaSeconds = 0;
        let reported: EnhancedGraphicsStatus | undefined;
        let load: { cancelled: boolean } | undefined;

        const report = (status: EnhancedGraphicsStatus | undefined) => {
            if (status === reported) return;
            reported = status;
            onEnhancedStatusRef.current?.(status);
        };

        const cancelLoad = () => {
            if (load) load.cancelled = true;
            load = undefined;
        };

        const releaseLook = () => {
            look?.dispose();
            look = undefined;
            mix = 0;
            mixTarget = 0;
        };

        const startLoad = () => {
            const token = { cancelled: false };
            load = token;
            state = 'loading';
            report('loading');
            loadEnhancedLookRef
                .current()
                .then((module) => {
                    // Switched off (or torn down) while the chunk was loading: it is never used.
                    if (token.cancelled) return;
                    load = undefined;
                    look = module.createTrioEnhancedLook({
                        renderer,
                        scene,
                        camera,
                        sheets: sheets.map((sheet) => sheet.flags),
                        size: currentSize,
                        valuesRef,
                        rhythm,
                        reducedMotion,
                    });
                    look.setMix(0);
                    mix = 0;
                    mixTarget = 1;
                    state = 'enhanced';
                    report('ready');
                })
                .catch((error: unknown) => {
                    if (token.cancelled) return;
                    console.warn('Trio enhanced look failed to load; using the standard look.', error);
                    load = undefined;
                    releaseLook();
                    state = 'standard';
                    failed = true;
                    report('error');
                });
        };

        const reconcile = () => {
            if (contextLost) return;
            const mode = resolveTrioLookMode(getEnhancedGraphics(), software);
            if (mode === 'enhanced') {
                if (state === 'standard' && !failed) {
                    startLoad();
                } else if (state === 'fading-out') {
                    // Back on before the fade finished: ramp up again on the same look.
                    state = 'enhanced';
                    mixTarget = 1;
                    report('ready');
                }
                return;
            }
            failed = false;
            if (state === 'loading') {
                cancelLoad();
                state = 'standard';
            } else if (state === 'enhanced') {
                state = 'fading-out';
                mixTarget = 0;
            }
            report(undefined);
        };

        const onContextLost = () => {
            contextLost = true;
            cancelLoad();
            releaseLook();
            state = 'standard';
            report(undefined);
        };
        renderer.domElement.addEventListener('webglcontextlost', onContextLost);
        const unsubscribe = subscribeEnhancedGraphics(reconcile);
        reconcile();

        return {
            camera,

            update: (_time, delta) => {
                lastDeltaSeconds = delta / 1000;
                const values = valuesRef.current;
                orbit.setLocked(cameraLockedRef.current);

                // A new source: keep the scene and give each sheet a fresh analyser tapped from it.
                const source = analyserRef.current;
                if (source && source !== boundAnalyser) {
                    sheets.forEach((sheet) => sheet.connect(source));
                    boundAnalyser = source;
                }

                for (const sheet of sheets) {
                    sheet.place(values.moveX, values.moveY);
                    sheet.update(values);
                }

                if (look && mix !== mixTarget) {
                    const step = Math.min(lastDeltaSeconds, MAX_FADE_STEP_SECONDS) / FADE_SECONDS;
                    mix = mixTarget > mix ? Math.min(mixTarget, mix + step) : Math.max(mixTarget, mix - step);
                    look.setMix(mix);
                }
                // Checked outside the step above: a look turned off before its fade-in moved is already at 0, so no
                // step runs, and it must still be released rather than left drawing while standard is reported.
                if (state === 'fading-out' && mix === 0) {
                    releaseLook();
                    state = 'standard';
                }

                if (import.meta.env.DEV) {
                    tickTelemetry(delta / 1000);
                }
            },

            // The loop calls this with no arguments, so the frame time comes from the last update.
            render: () => {
                if (look) {
                    look.render(lastDeltaSeconds);
                } else {
                    renderer.render(scene, camera);
                }
            },

            resize: (next) => {
                currentSize = next;
                look?.setSize(next);
            },

            dispose: () => {
                unsubscribe();
                cancelLoad();
                renderer.domElement.removeEventListener('webglcontextlost', onContextLost);
                // The look puts the standard meshes back, so it goes before the sheets are disposed.
                releaseLook();
                report(undefined);
                orbit.dispose();
                sheets.forEach((sheet) => sheet.dispose());
                unregisterProbe?.();
            },
        };
    });

    const resetView = useCallback(() => resetViewRef.current(), []);
    return { resetView };
}
