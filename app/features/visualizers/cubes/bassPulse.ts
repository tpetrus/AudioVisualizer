// The bass is isolated by its own steep low-pass filter chain feeding a separate analyser, so mids and drums
// don't leak in the way they do into the coarse low FFT bins.
const BASS_CUTOFF_HZ = 120;
// ~43 ms at 48 kHz: long enough to hold a full cycle of the lowest bass notes.
const BASS_FFT_SIZE = 2048;

// 0..1 bass envelope that bumps when the bass (and only the bass) gets louder than it has recently been.
// Comparing against its own recent level means it works at any volume, and a busy mix doesn't trigger it.
export class BassPulse {
    private readonly source: AnalyserNode;
    private readonly filters: BiquadFilterNode[];
    private readonly analyser: AnalyserNode;
    // Backed by a plain ArrayBuffer, which the Web Audio API requires (not a SharedArrayBuffer).
    private readonly samples: Float32Array<ArrayBuffer>;
    // Fast and slow followers of the bass energy; a bump is the fast one rising above the slow one.
    private fast = 0;
    private slow = 0;
    private pulse = 0;

    // Taps the source's output through two cascaded low-pass filters (24 dB/octave) into a bass-only analyser.
    constructor(source: AnalyserNode) {
        this.source = source;
        const context = source.context;
        this.filters = [0, 1].map(() => {
            const filter = context.createBiquadFilter();
            filter.type = 'lowpass';
            filter.frequency.value = BASS_CUTOFF_HZ;
            filter.Q.value = Math.SQRT1_2;
            return filter;
        });
        this.analyser = context.createAnalyser();
        this.analyser.fftSize = BASS_FFT_SIZE;
        this.samples = new Float32Array(this.analyser.fftSize);

        source.connect(this.filters[0]);
        this.filters[0].connect(this.filters[1]);
        this.filters[1].connect(this.analyser);
    }

    // Advances the envelope by one frame and returns it.
    public update(): number {
        this.analyser.getFloatTimeDomainData(this.samples);
        let sum = 0;
        for (const sample of this.samples) {
            sum += sample * sample;
        }
        const energy = Math.sqrt(sum / this.samples.length);

        this.fast += (energy - this.fast) * (energy > this.fast ? 0.5 : 0.2);
        // ~1.5 s memory, so each new bass note or hit stands out against what came before.
        this.slow += (energy - this.slow) * 0.01;

        // Ignore near-silence, and small wobbles within 15% of the recent level.
        const ratio = this.slow > 0.005 ? this.fast / this.slow : 1;
        const target = Math.min(1, Math.max(0, (ratio - 1.15) * 1.5));

        // Rises over a couple of frames rather than instantly, and settles over ~0.3 s, so it moves smoothly.
        this.pulse += (target - this.pulse) * (target > this.pulse ? 0.45 : 0.12);
        return this.pulse;
    }

    public dispose(): void {
        try {
            this.source.disconnect(this.filters[0]);
        } catch {
            // Already disconnected: the source's audio context was closed when the capture stopped.
        }
        this.filters.forEach((filter) => filter.disconnect());
        this.analyser.disconnect();
    }
}
