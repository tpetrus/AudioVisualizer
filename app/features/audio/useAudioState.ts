import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { useAudio } from './audioEngineContext';
import type { AnalyserSettings, NormalizeSettings, OwnedAnalyser } from './types';

// Without options: the engine's shared tap (fixed settings, read-only). With options: a node owned by the calling
// component, acquired in an effect and released in its cleanup, so a StrictMode double mount leaves one live node.
// Options are compared by value; changed values are assigned to the existing node.
export function useAnalyser(): AnalyserNode | undefined;
export function useAnalyser(options: AnalyserSettings): AnalyserNode | undefined;
export function useAnalyser(options?: AnalyserSettings): AnalyserNode | undefined {
    const engine = useAudio();
    const tap = useSyncExternalStore(engine.subscribe, engine.getAnalyser, engine.getAnalyser);
    const [owned, setOwned] = useState<AnalyserNode | undefined>(undefined);
    const handleRef = useRef<OwnedAnalyser | undefined>(undefined);
    const optionsRef = useRef(options);
    const wantsOwned = options !== undefined;
    const fftSize = options?.fftSize;
    const smoothingTimeConstant = options?.smoothingTimeConstant;
    const minDecibels = options?.minDecibels;
    const maxDecibels = options?.maxDecibels;

    // Refs are written in an effect, not during render. This one runs before the acquiring effect below.
    useEffect(() => {
        optionsRef.current = options;
    });

    useEffect(() => {
        const initial = optionsRef.current;
        if (!initial) {
            return;
        }
        const handle = engine.acquireAnalyser(initial);
        handleRef.current = handle;
        setOwned(handle.getNode());
        const unsubscribe = engine.subscribe(() => setOwned(handle.getNode()));
        return () => {
            unsubscribe();
            handle.release();
            handleRef.current = undefined;
            setOwned(undefined);
        };
    }, [engine, wantsOwned]);

    // Changed values go onto the existing node. The decibel range goes first, so a new range never meets the old
    // one half way and gets rejected.
    useEffect(() => {
        const node = handleRef.current?.getNode();
        if (!node || fftSize === undefined) {
            return;
        }
        node.minDecibels = minDecibels as number;
        node.maxDecibels = maxDecibels as number;
        node.fftSize = fftSize;
        node.smoothingTimeConstant = smoothingTimeConstant as number;
    }, [owned, fftSize, smoothingTimeConstant, minDecibels, maxDecibels]);

    return wantsOwned ? owned : tap;
}

export function useCapturing(): boolean {
    const engine = useAudio();
    return useSyncExternalStore(engine.subscribe, engine.getIsCapturing, engine.getIsCapturing);
}

export function useNormalize(): boolean {
    const engine = useAudio();
    return useSyncExternalStore(engine.subscribe, engine.getNormalize, engine.getNormalize);
}

export function useNormalizeOptions(): NormalizeSettings {
    const engine = useAudio();
    return useSyncExternalStore(engine.subscribe, engine.getNormalizeOptions, engine.getNormalizeOptions);
}
