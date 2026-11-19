import { BassPulse } from '../../../app/features/rhythm/bassPulse';
import { filterLowpass, lowpassCoefficients } from './biquad';

// The pre-hub gate input (PR 95 and before): the real BassPulse class, fed by two cascaded lowpass biquads and an
// analyser that the page used to read every animation frame. BassPulse builds those nodes through its source's audio
// context, so it is given a fake context whose nodes only record what BassPulse configured. The filtering itself is
// done here, offline, with the spec's lowpass formulas and the cutoff and Q BassPulse set, so BassPulse stays the
// source of truth for both the filters and the envelope math.

interface StubFilter {
    type: string;
    frequency: { value: number };
    Q: { value: number };
    connect: () => void;
    disconnect: () => void;
}

interface StubAnalyser {
    fftSize: number;
    connect: () => void;
    disconnect: () => void;
    getFloatTimeDomainData: (target: Float32Array) => void;
}

export class PrehubBass {
    private readonly pulse: BassPulse;
    private readonly stubs: StubFilter[] = [];
    private readonly analyser: StubAnalyser;
    private filtered: Float32Array = new Float32Array(0);
    // Sample the analyser's window ends at for the current update.
    private end = 0;

    constructor(private readonly sampleRate: number) {
        const noop = (): void => {};
        const context = {
            createBiquadFilter: (): StubFilter => {
                const filter: StubFilter = {
                    type: 'allpass',
                    frequency: { value: 350 },
                    Q: { value: 1 },
                    connect: noop,
                    disconnect: noop,
                };
                this.stubs.push(filter);
                return filter;
            },
            createAnalyser: (): StubAnalyser => this.analyser,
        };
        this.analyser = {
            fftSize: 2048,
            connect: noop,
            disconnect: noop,
            // The latest fftSize samples up to the current end, as an AnalyserNode returns them; before the start of the
            // audio the window is zero.
            getFloatTimeDomainData: (target) => {
                const length = target.length;
                const start = this.end - length;
                for (let i = 0; i < length; i++) {
                    const index = start + i;
                    target[i] = index >= 0 && index < this.filtered.length ? this.filtered[index] : 0;
                }
            },
        };
        const source = { context, connect: noop, disconnect: noop } as unknown as AnalyserNode;
        this.pulse = new BassPulse(source);
    }

    // Filters the whole post-gain signal through the stages BassPulse configured.
    public prepare(pcm: Float32Array): void {
        let signal = pcm;
        for (const stub of this.stubs) {
            if (stub.type !== 'lowpass')
                throw new Error(`BassPulse configured a ${stub.type} filter, expected lowpass`);
            signal = filterLowpass(signal, lowpassCoefficients(stub.frequency.value, stub.Q.value, this.sampleRate));
        }
        this.filtered = signal;
    }

    // Reuses another instance's filtered signal, so a second reader of the same audio (with its own envelope) does not
    // filter the whole track again. Both were built by BassPulse with the same filters, so the signal is the same.
    public shareFiltered(other: PrehubBass): void {
        this.filtered = other.filtered;
    }

    // BassPulse's feature at its last update: the RMS of its analyser window, before the envelope.
    public get energy(): number {
        return this.pulse.energy;
    }

    // One animation frame at `time` seconds: the envelope BassPulse shows.
    public update(time: number): number {
        return this.updateAtSample(Math.floor(time * this.sampleRate));
    }

    // One animation frame whose analyser window ends at sample `end` rather than at the frame's time: the read a
    // per-frame feature from the worklet would give, which is only as new as the last frame delivered.
    public updateAtSample(end: number): number {
        this.end = end;
        return this.pulse.update();
    }
}
