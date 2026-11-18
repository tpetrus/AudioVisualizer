import { BOUNDARY_SOFT, BoundaryDetector } from '../../../app/features/rhythm/boundary';

// The analyzer reports a soft boundary only by raising songChangeCount, exactly as a hard one (silence) does, and keeps
// its boundary detector private, so the two cannot be told apart from the state. The scenarios need the soft ones alone,
// so this wraps the two detector methods that return a boundary kind and counts the soft results. It changes nothing the
// analyzer sees: each wrapper returns what the original returned. The wrappers are put back when `run` ends, even if it
// throws, so nothing else in the process is affected.
//
// If the detector's method names change, the spec that feeds it a soft change fails, so a rename cannot silently turn
// the scenarios into zeros.
export function countSoftBoundaries<T>(run: () => T): { result: T; softBoundaries: number } {
    const prototype = BoundaryDetector.prototype;
    // The originals are always called back with their own `this` through apply below.
    /* eslint-disable @typescript-eslint/unbound-method */
    const originalPush = prototype.push;
    const originalPushTempo = prototype.pushTempo;
    /* eslint-enable @typescript-eslint/unbound-method */
    let softBoundaries = 0;
    prototype.push = function (this: BoundaryDetector, ...args: Parameters<typeof originalPush>) {
        const kind = originalPush.apply(this, args);
        if (kind === BOUNDARY_SOFT) softBoundaries++;
        return kind;
    };
    prototype.pushTempo = function (this: BoundaryDetector, ...args: Parameters<typeof originalPushTempo>) {
        const kind = originalPushTempo.apply(this, args);
        if (kind === BOUNDARY_SOFT) softBoundaries++;
        return kind;
    };
    try {
        const result = run();
        return { result, softBoundaries };
    } finally {
        prototype.push = originalPush;
        prototype.pushTempo = originalPushTempo;
    }
}
