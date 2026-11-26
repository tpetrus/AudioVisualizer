// The bass reaction that needs no tempo lock and no learned gate: the whole cloud swells and glows on every bass hit,
// like the cubes' backdrop does (`bump * bgPulse` in cubesBass.ts). The input is the scene's own `lastGateBass`, the
// hub's gate bass already stepped through the shared bump envelope each frame, so no second envelope is kept here.
export interface BassSwell {
    // Radial swell of the cloud, 0..1.
    swell: number;
    // Strength of the brightness glow, 0..1 (it still goes through BrightnessMix).
    glow: number;
}

// The swell and the glow are the bump itself. It reacts instantly, without waiting for the beat lock or any learned
// level, because instant feedback matters more than accuracy here (user request): the beat lock takes seconds, and
// until then the cloud would barely move. Input that is not finite reads as no pulse. Allocates nothing.
export function swellFromBump(lastGateBass: number, out: BassSwell): void {
    // NaN would pass both clamps, so it is read as 0 first.
    const level = Number.isFinite(lastGateBass) ? Math.min(1, Math.max(0, lastGateBass)) : 0;
    out.swell = level;
    out.glow = level;
}
