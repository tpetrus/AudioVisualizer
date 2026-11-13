import type { BassGateState } from '~/features/rhythm/bassGate';
import { KICK_SLOTS, type KickRingView } from './bassInkTypes';

// Start time of an empty slot: so far in the past that its shockwave is long gone.
const EMPTY_TIME = -1e6;

// The parts of the shared bass gate a kick is read from.
export type KickSource = Pick<BassGateState, 'bumpCount' | 'bumpTarget' | 'weight'>;

// Turns the bass gate's beat pulses into discrete kicks and remembers the latest KICK_SLOTS of them.
//
// The raw kick onset also fires on syncopated bass notes, toms and claps, which made the cloud twitch off the beat
// people dance to (measured: 2.5 to 3 shockwaves a second at 135 BPM, and as many on a clip with no kick drum). The
// gate instead learns where in the beat the bassline's kick lands and pulses there on the beat clock, so a
// shockwave is always on the main pulse, and stray bass never makes one.
export class KickRing implements KickRingView {
    readonly times = new Float32Array(KICK_SLOTS).fill(EMPTY_TIME);
    readonly strengths = new Float32Array(KICK_SLOTS);
    count = 0;
    private seenBumps: number | undefined;

    // Returns true when this frame recorded a kick: the gate started a new pulse since the previous call.
    update(gate: KickSource, nowSeconds: number): boolean {
        // A counter, not a level, so a pulse is never missed or counted twice whatever the frame rate. The first call
        // only records it, so a gate that has been running does not count as a kick.
        const fresh = this.seenBumps !== undefined && gate.bumpCount !== this.seenBumps;
        this.seenBumps = gate.bumpCount;
        if (!fresh) {
            return false;
        }
        // The gate's weight eases in as it opens, so the first pulses of a newly found bassline are gentle.
        const slot = this.count % KICK_SLOTS;
        this.times[slot] = nowSeconds;
        this.strengths[slot] = Math.min(1, Math.max(0, gate.bumpTarget * gate.weight));
        this.count++;
        return true;
    }
}
