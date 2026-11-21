import { GateBassTap } from '~/features/audio/hub/gateBassTap';

// The pre-hub bass envelope. No visualizer uses it any more (they read the hub's gateBass instead); it is kept as the
// reference the hub's BassBump is tested against and that the scorecard replays for its pre-hub column.
//
// 0..1 bass envelope that bumps when the bass (and only the bass) gets louder than it has recently been.
// Comparing against its own recent level means it works at any volume, and a busy mix doesn't trigger it. Its feature
// is the hub's gate-input bass (GateBassTap): the same filters and window, from its own tap of the source.
export class BassPulse {
    private readonly tap: GateBassTap;
    // Fast and slow followers of the bass energy; a bump is the fast one rising above the slow one.
    // Public only so DEV telemetry can read them; nothing outside this class writes them.
    public fast = 0;
    public slow = 0;
    public pulse = 0;
    public energy = 0;
    public ratio = 1;

    // Taps the source's output through two cascaded low-pass filters (24 dB/octave) into a bass-only analyser.
    constructor(source: AnalyserNode) {
        this.tap = new GateBassTap(source);
    }

    // Advances the envelope by one frame and returns it.
    public update(): number {
        const energy = this.tap.level();

        this.fast += (energy - this.fast) * (energy > this.fast ? 0.5 : 0.2);
        // ~1.5 s memory, so each new bass note or hit stands out against what came before.
        this.slow += (energy - this.slow) * 0.01;

        // Ignore near-silence, and small wobbles within 15% of the recent level.
        const ratio = this.slow > 0.005 ? this.fast / this.slow : 1;
        this.energy = energy;
        this.ratio = ratio;
        const target = Math.min(1, Math.max(0, (ratio - 1.15) * 1.5));

        // Rises over a couple of frames rather than instantly, and settles over ~0.3 s, so it moves smoothly.
        this.pulse += (target - this.pulse) * (target > this.pulse ? 0.45 : 0.12);
        return this.pulse;
    }

    public dispose(): void {
        this.tap.dispose();
    }
}
