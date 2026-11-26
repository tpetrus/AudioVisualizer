import { useEffect, useState } from 'react';
import { detectCapability, probeCapability } from './capability';

// One probe per page visit: every toggle shares the result, and a second WebGL context is never created for it.
let cached: Promise<boolean> | undefined;

function probeOnce(): Promise<boolean> {
    cached ??= probeCapability().then((probe) => probe !== undefined && detectCapability(probe));
    return cached;
}

// False until the probe resolves true, so a failed or slow probe shows no hint.
export function useCapabilityHint(): boolean {
    const [capable, setCapable] = useState(false);
    useEffect(() => {
        let active = true;
        void probeOnce().then((result) => {
            if (active) {
                setCapable(result);
            }
        });
        return () => {
            active = false;
        };
    }, []);
    return capable;
}

// Lets specs start from an unprobed page.
export function resetCapabilityHintForTests(): void {
    cached = undefined;
}
