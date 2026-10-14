import type { ReactNode } from "react";
import { audioEngine, type AudioEngine } from "./audioEngine";
import { AudioEngineContext } from "./audioEngineContext";

type Props = {children: ReactNode, engine?: AudioEngine};

export default function AudioProvider({children, engine = audioEngine}: Props) {
    return <AudioEngineContext.Provider value={engine}>
        {children}
    </AudioEngineContext.Provider>
}