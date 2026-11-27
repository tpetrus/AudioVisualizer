import type { DirectorCue } from './bassInkTypes';
import { bassInkSceneConfig } from './bassInkSceneConfig';
import { hash01 } from './formations';

// Offsets, in radians, added to the cloud's tilt and to its accumulated drift.
export interface ViewAngles {
    tilt: number;
    yaw: number;
}

const TILT_SALT = 41;
const YAW_SALT = 42;

// Reframes the view on each section change, like a camera operator: when the director starts a transition, the tilt and
// turn offsets ease to a new hashed target over the transition and hold there until the next one. It only produces
// offsets; the scene adds them to the cloud's tilt and drift, so the swing never accumulates into the drift itself.
export class ViewSwing {
    private readonly seed: number;
    private count = 0;
    // The offsets before amount scaling, where the ease started and where it is going.
    private fromTilt = 0;
    private fromYaw = 0;
    private toTilt = 0;
    private toYaw = 0;
    private currentTilt = 0;
    private currentYaw = 0;

    constructor(seed: number) {
        this.seed = seed;
    }

    // Call every frame. `amount` (0..1) scales the output every frame (the targets themselves are unscaled, so the
    // swing is proportional to the amount and follows a slider move at once); 0 gives no offset at once. Writes into `out`, so nothing is allocated per frame.
    step(cue: Readonly<DirectorCue>, nowSeconds: number, amount: number, out: ViewAngles): void {
        const { transitionCount, transitionStart, transitionSeconds } = cue;
        if (
            !Number.isFinite(transitionCount) ||
            !Number.isFinite(transitionStart) ||
            !Number.isFinite(transitionSeconds) ||
            !Number.isFinite(nowSeconds) ||
            !Number.isFinite(amount)
        ) {
            out.tilt = 0;
            out.yaw = 0;
            return;
        }
        const scale = Math.min(1, Math.max(0, amount));
        const { tiltSwing, yawSwing } = bassInkSceneConfig.view;
        if (transitionCount !== this.count) {
            this.count = transitionCount;
            // A new change eases from wherever the last one had got to, so a quick succession never jumps.
            this.fromTilt = this.currentTilt;
            this.fromYaw = this.currentYaw;
            this.toTilt = (hash01(transitionCount, this.seed, TILT_SALT) * 2 - 1) * tiltSwing;
            this.toYaw = (hash01(transitionCount, this.seed, YAW_SALT) * 2 - 1) * yawSwing;
        }
        let progress = 1;
        if (transitionCount > 0 && transitionSeconds > 0) {
            progress = Math.min(1, Math.max(0, (nowSeconds - transitionStart) / transitionSeconds));
        }
        const eased = progress * progress * (3 - 2 * progress);
        this.currentTilt = this.fromTilt + (this.toTilt - this.fromTilt) * eased;
        this.currentYaw = this.fromYaw + (this.toYaw - this.fromYaw) * eased;
        // Adding 0 turns a negative zero into a plain one, so an amount of 0 reads as exactly 0.
        out.tilt = this.currentTilt * scale + 0;
        out.yaw = this.currentYaw * scale + 0;
    }
}
