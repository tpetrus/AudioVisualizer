import * as THREE from 'three';
import { bassInkSceneConfig, type SpectrumConfig } from './bassInkSceneConfig';
import { blur, createKernel, sampleLogSpectrum } from '../trio-color-wave/spectrum';

// The recent spectrum as a small texture the cloud's vertex shader reads per point: one column per log-spaced
// frequency, one row per frame, a ring of the latest rows. Each point reads the frequency its angle on screen stands
// for, from a row further back the closer it is to the center, so the outline is the spectrum now and each frequency
// rolls inward behind it as a wave (the way the rows of the trio sheets chase the front row).
export class SpectrumField {
    readonly texture: THREE.DataTexture;
    readonly columns: number;
    readonly rows: number;
    // Row most recently written.
    head = 0;
    // Recent peak and running average (0..255) of each column, so each frequency is measured against itself.
    readonly peaks: Float32Array;
    readonly means: Float32Array;
    // False until the first frame, which seeds the averages: starting them at 0 would read every frequency as far above
    // its average for seconds, and the whole cloud would swell at the start of each source.
    private seeded = false;

    private readonly data: Uint8Array;
    private readonly sampled: Float32Array;
    private readonly blurred: Float32Array;
    private readonly levels: Float32Array;
    private readonly kernel: Float32Array;
    private readonly config: SpectrumConfig;

    constructor(config: SpectrumConfig = bassInkSceneConfig.spectrum) {
        this.config = config;
        this.columns = config.columns;
        this.rows = config.rows;
        this.data = new Uint8Array(this.columns * this.rows);
        this.sampled = new Float32Array(this.columns);
        this.blurred = new Float32Array(this.columns);
        this.levels = new Float32Array(this.columns);
        this.peaks = new Float32Array(this.columns);
        this.means = new Float32Array(this.columns);
        this.kernel = createKernel(config.blurSigma);
        this.texture = new THREE.DataTexture(
            this.data,
            this.columns,
            this.rows,
            THREE.RedFormat,
            THREE.UnsignedByteType,
        );
        // Linear across frequencies and rows so the waves are smooth; repeating in time because the rows are a ring.
        this.texture.magFilter = THREE.LinearFilter;
        this.texture.minFilter = THREE.LinearFilter;
        this.texture.wrapS = THREE.ClampToEdgeWrapping;
        this.texture.wrapT = THREE.RepeatWrapping;
        this.texture.generateMipmaps = false;
        this.texture.needsUpdate = true;
    }

    // 0..1 vertical texture coordinate of the newest row's center, for the shader.
    get headCoordinate(): number {
        return (this.head + 0.5) / this.rows;
    }

    // Adds this frame's spectrum as the newest row. `spectrum` is the analyser's byte frequency data.
    update(spectrum: Uint8Array, binHz: number, dtSeconds: number): void {
        const config = this.config;
        sampleLogSpectrum(spectrum, binHz, config.lowHz, config.highHz, this.sampled);
        blur(this.sampled, this.kernel, this.blurred);
        if (!this.seeded) {
            this.means.set(this.blurred);
            this.seeded = true;
        }

        const dt = Math.max(0, dtSeconds);
        const rise = 1 - Math.exp(-dt / config.attackSeconds);
        const fall = 1 - Math.exp(-dt / config.releaseSeconds);
        const average = 1 - Math.exp(-dt / config.meanSeconds);
        this.head = (this.head + 1) % this.rows;
        const offset = this.head * this.columns;
        for (let column = 0; column < this.columns; column++) {
            // The byte spectrum is in dB, so a frequency barely changes relative to its peak. Measured between its own
            // running average and its peak instead, a frequency moves when it rises above what it has been doing, so
            // every band bobs to its own rhythm, like the trio bars.
            const value = this.blurred[column];
            const peak = Math.max(value, this.peaks[column] * config.peakDecay);
            this.peaks[column] = peak;
            const mean = this.means[column] + (value - this.means[column]) * average;
            this.means[column] = mean;
            const normalized = value > config.peakFloor ? (value - mean) / Math.max(peak - mean, config.minRange) : 0;
            const target = Math.min(1, Math.max(0, (normalized - config.knee) / (1 - config.knee)));
            const current = this.levels[column];
            const next = current + (target - current) * (target > current ? rise : fall);
            this.levels[column] = next;
            this.data[offset + column] = Math.round(next * 255);
        }
        this.texture.needsUpdate = true;
    }

    // Lets the field fall flat when there is no source, so the cloud settles instead of freezing mid-wave. The next
    // source is different music, so its first frame seeds the averages again.
    fade(dtSeconds: number): void {
        this.seeded = false;
        const fall = 1 - Math.exp(-Math.max(0, dtSeconds) / this.config.releaseSeconds);
        this.head = (this.head + 1) % this.rows;
        const offset = this.head * this.columns;
        for (let column = 0; column < this.columns; column++) {
            this.levels[column] -= this.levels[column] * fall;
            this.data[offset + column] = Math.round(this.levels[column] * 255);
        }
        this.texture.needsUpdate = true;
    }

    // A different source is different music: its first frame seeds the averages afresh. The shown levels fall on their
    // own, so the cloud does not jump.
    reset(): void {
        this.seeded = false;
    }

    dispose(): void {
        this.texture.dispose();
    }
}
