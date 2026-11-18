import { BassBump, GATE_BASS_BUMP } from '~/features/audio/hub/bassBump';
import type { HubGateBass } from '~/features/audio/hub/types';

// The cubes' bass trigger: the background flash and the backdrop lift on bass hits. It is a pure step over the hub's
// gate-input bass (contract C1) so the offline scorecard replays exactly what the scene runs (hub-regressions S4).

export interface CubesBassSettings {
    // The "bass bump" switch of the controls.
    bassBump: boolean;
    // How strongly a hit shows, 0..1.
    bgPulse: number;
}

// BassPulse's envelope over BassPulse's feature, as the cubes ran it before the hub; one per scene.
export function createCubesBassEnvelope(): BassBump {
    return new BassBump(GATE_BASS_BUMP);
}

// Advances the envelope by one frame and returns the pulse the scene shows, 0..1 (0 while the switch is off; the
// envelope still follows the bass then, so turning it on shows the next hit and not a stale one). Allocates nothing.
export function stepCubesBass(
    envelope: BassBump,
    gateBass: Readonly<HubGateBass>,
    deltaSeconds: number,
    settings: Readonly<CubesBassSettings>,
): number {
    const bump = envelope.step(gateBass.pulse, deltaSeconds);
    return settings.bassBump ? bump * settings.bgPulse : 0;
}
