// Generates e2e/fixtures/beat-120bpm.wav, the audio Chromium plays as the fake microphone during the E2E tests.
// Regenerate with `npm run e2e:fixture` (run from the repo root) and commit the result. The synthesis is the
// deterministic click track the rhythm specs use, so the output is byte-for-byte reproducible.
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { renderTrack, TEST_SAMPLE_RATE } from '../../app/features/rhythm/testSignals';

const SECONDS = 8;
const BPM = 120;
// Leave headroom so 16-bit quantisation never clips.
const PEAK = 0.8;

// Wraps 16-bit mono PCM in a canonical 44-byte-header WAV container.
function encodeWav(pcm: Float32Array, sampleRate: number): Buffer {
    const bytesPerSample = 2;
    const dataBytes = pcm.length * bytesPerSample;
    const buffer = Buffer.alloc(44 + dataBytes);
    buffer.write('RIFF', 0, 'ascii');
    buffer.writeUInt32LE(36 + dataBytes, 4);
    buffer.write('WAVE', 8, 'ascii');
    buffer.write('fmt ', 12, 'ascii');
    buffer.writeUInt32LE(16, 16); // fmt chunk size
    buffer.writeUInt16LE(1, 20); // PCM
    buffer.writeUInt16LE(1, 22); // mono
    buffer.writeUInt32LE(sampleRate, 24);
    buffer.writeUInt32LE(sampleRate * bytesPerSample, 28); // byte rate
    buffer.writeUInt16LE(bytesPerSample, 32); // block align
    buffer.writeUInt16LE(16, 34); // bits per sample
    buffer.write('data', 36, 'ascii');
    buffer.writeUInt32LE(dataBytes, 40);

    let max = 0;
    for (const sample of pcm) {
        max = Math.max(max, Math.abs(sample));
    }
    const scale = max > 0 ? PEAK / max : 1;
    pcm.forEach((sample, index) => {
        buffer.writeInt16LE(Math.round(sample * scale * 32767), 44 + index * bytesPerSample);
    });
    return buffer;
}

const { pcm } = renderTrack({ seconds: SECONDS, bpm: BPM, beatsPerBar: 4 });
const output = resolve('e2e/fixtures/beat-120bpm.wav');
mkdirSync(dirname(output), { recursive: true });
writeFileSync(output, encodeWav(pcm, TEST_SAMPLE_RATE));
console.log(`Wrote ${output}`);
