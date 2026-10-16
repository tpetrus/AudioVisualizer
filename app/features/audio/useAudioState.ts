import { useSyncExternalStore } from "react";
import { useAudio } from "./audioEngineContext";
import type { NormalizeSettings } from "./types";

export function useAnalyser(): AnalyserNode | undefined {
    const engine = useAudio();
    return useSyncExternalStore(engine.subscribe, engine.getAnalyser, engine.getAnalyser);
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