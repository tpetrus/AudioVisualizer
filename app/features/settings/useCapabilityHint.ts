import { useEffect, useState } from 'react';
import { detectCapability, probeCapability } from './capability';

// One probe per page visit: every toggle shares the result, and a second WebGL context is never created for it.
let cached: Promise<boolean> | undefined;

function probeOnce(): Promise<boolean> {
    cached ??= probeCapability().then((probe) => probe !== undefined && detectCapability(probe));
    return cached;
}

// False until the probe resolves true, so a failed or slow probe shows no hint. While `enabled` is false (the
// preference is already on, so no hint can show) no probe is taken and no WebGL context is created.
export function useCapabilityHint(enabled: boolean): boolean {
    const [capable, setCapable] = useState(false);
    useEffect(() => {
        if (!enabled) {
            return;
        }
        let active = true;
        void probeOnce().then((result) => {
            if (active) {
                setCapable(result);
            }
        });
        return () => {
            active = false;
        };
    }, [enabled]);
    return enabled && capable;
}
