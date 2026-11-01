import {
    BASS_CUTOFF_HZ,
    BASS_FAST_ATTACK,
    BASS_FAST_RELEASE,
    BASS_FFT_SIZE,
    BASS_PULSE_FALL,
    BASS_PULSE_RISE,
    BASS_RATIO_DEADBAND,
    BASS_RATIO_GAIN,
    BASS_SILENCE_FLOOR,
    BASS_SLOW_RATE,
} from './dancingCharacterConfig';

// 0..1 envelope that bumps when the bass (and only the bass) gets louder than it has recently been. Comparing against
// its own recent level means it works at any volume, and a busy mix does not trigger it.
export class DancingCharacterBassPulse {
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

        this.fast += (energy - this.fast) * (energy > this.fast ? BASS_FAST_ATTACK : BASS_FAST_RELEASE);
        this.slow += (energy - this.slow) * BASS_SLOW_RATE;

        const ratio = this.slow > BASS_SILENCE_FLOOR ? this.fast / this.slow : 1;
        const target = Math.min(1, Math.max(0, (ratio - BASS_RATIO_DEADBAND) * BASS_RATIO_GAIN));

        this.pulse += (target - this.pulse) * (target > this.pulse ? BASS_PULSE_RISE : BASS_PULSE_FALL);
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
