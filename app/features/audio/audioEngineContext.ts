import { createContext, useContext } from 'react';
import type { AudioEngine } from './audioEngine';

export const AudioEngineContext = createContext<AudioEngine | null>(null);

export function useAudio(): AudioEngine {
    const engine = useContext(AudioEngineContext);
    if (engine === null) throw Error('useAudio must be used inside <AudioProvider>');
    return engine;
}
