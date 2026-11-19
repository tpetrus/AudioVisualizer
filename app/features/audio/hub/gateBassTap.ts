// The gate-input bass of contract C1 (hub-regressions S4): BassPulse's feature, the root mean square of the music after
// two cascaded 120 Hz lowpass filters (24 dB/octave) over the newest 2048 samples (~43 ms at 48 kHz, a full cycle of the
// lowest bass notes). The filters isolate the bass, so mids and drums don't leak in the way they do into the coarse low
// FFT bins.
//
// It is read from the audio graph at the render time, not carried in the worklet's frames: a frame is up to a batch old
// when it reaches the main thread, and live that made the cubes and the dancer react 10 to 20 ms later than the same
// feature read here (S4's live measurement, docs/agents/hub-scorecard.md).
export const GATE_BASS_CUTOFF_HZ = 120;
export const GATE_BASS_WINDOW = 2048;

// A reader of the gate-input bass level: the hub's own tap of the audio graph live, an offline reader in the scorecard.
export interface GateBassLevel {
    // The level now, >= 0. Called once per animation frame.
    level(): number;
    dispose(): void;
}

// Taps `source` through the two filters into a bass-only analyser. Allocates only in the constructor.
export class GateBassTap implements GateBassLevel {
    private readonly source: AnalyserNode;
    private readonly filters: BiquadFilterNode[];
    private readonly analyser: AnalyserNode;
    // Backed by a plain ArrayBuffer, which the Web Audio API requires (not a SharedArrayBuffer).
    private readonly samples: Float32Array<ArrayBuffer>;

    constructor(source: AnalyserNode) {
        this.source = source;
        const context = source.context;
        this.filters = [0, 1].map(() => {
            const filter = context.createBiquadFilter();
            filter.type = 'lowpass';
            filter.frequency.value = GATE_BASS_CUTOFF_HZ;
            filter.Q.value = Math.SQRT1_2;
            return filter;
        });
        this.analyser = context.createAnalyser();
        this.analyser.fftSize = GATE_BASS_WINDOW;
        this.samples = new Float32Array(this.analyser.fftSize);

        source.connect(this.filters[0]);
        this.filters[0].connect(this.filters[1]);
        this.filters[1].connect(this.analyser);
    }

    // The RMS of the analyser's window: the newest filtered samples.
    public level(): number {
        this.analyser.getFloatTimeDomainData(this.samples);
        let sum = 0;
        for (const sample of this.samples) {
            sum += sample * sample;
        }
        return Math.sqrt(sum / this.samples.length);
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
