// Reads a RIFF/WAVE file and mixes it down to mono floats in -1..1. Handles integer PCM (8, 16, 24, 32 bit), IEEE
// float (32, 64 bit) and the WAVE_FORMAT_EXTENSIBLE wrapper around either. A copy of the reader in
// scripts/eval-rhythm.ts, which keeps its own so that script stays a single file.
export function readWav(buffer: Buffer): { sampleRate: number; samples: Float32Array } {
    if (buffer.length < 12 || buffer.toString('ascii', 0, 4) !== 'RIFF' || buffer.toString('ascii', 8, 12) !== 'WAVE') {
        throw new Error('Not a RIFF/WAVE file');
    }
    let format = 0;
    let channels = 0;
    let sampleRate = 0;
    let bits = 0;
    let dataStart = -1;
    let dataLength = 0;
    let offset = 12;
    while (offset + 8 <= buffer.length) {
        const id = buffer.toString('ascii', offset, offset + 4);
        const size = buffer.readUInt32LE(offset + 4);
        const body = offset + 8;
        if (id === 'fmt ') {
            format = buffer.readUInt16LE(body);
            channels = buffer.readUInt16LE(body + 2);
            sampleRate = buffer.readUInt32LE(body + 4);
            bits = buffer.readUInt16LE(body + 14);
            if (format === 0xfffe && size >= 26) {
                // The real format is the first two bytes of the sub-format GUID.
                format = buffer.readUInt16LE(body + 24);
            }
        } else if (id === 'data') {
            dataStart = body;
            // Streamed files may declare a size past the end of the buffer.
            dataLength = Math.min(size, buffer.length - body);
            break;
        }
        // Chunks are padded to an even size.
        offset = body + size + (size % 2);
    }
    if (dataStart < 0 || channels === 0 || sampleRate === 0) {
        throw new Error('Missing fmt or data chunk');
    }
    const bytesPerSample = bits / 8;
    const frames = Math.floor(dataLength / (bytesPerSample * channels));
    const samples = new Float32Array(frames);
    const read = (position: number): number => {
        if (format === 3 && bits === 32) {
            return buffer.readFloatLE(position);
        }
        if (format === 3 && bits === 64) {
            return buffer.readDoubleLE(position);
        }
        if (format === 1) {
            switch (bits) {
                case 8:
                    return (buffer.readUInt8(position) - 128) / 128;
                case 16:
                    return buffer.readInt16LE(position) / 32768;
                case 24:
                    return buffer.readIntLE(position, 3) / 8388608;
                case 32:
                    return buffer.readInt32LE(position) / 2147483648;
            }
        }
        throw new Error(`Unsupported WAV format ${format} with ${bits} bits`);
    };
    for (let frame = 0; frame < frames; frame++) {
        let sum = 0;
        for (let channel = 0; channel < channels; channel++) {
            sum += read(dataStart + (frame * channels + channel) * bytesPerSample);
        }
        samples[frame] = sum / channels;
    }
    return { sampleRate, samples };
}

// Encodes mono floats in -1..1 as a 16-bit PCM WAV file. Samples beyond full scale are clipped.
export function writeWav(samples: Float32Array, sampleRate: number): Buffer {
    const dataBytes = samples.length * 2;
    const buffer = Buffer.alloc(44 + dataBytes);
    buffer.write('RIFF', 0, 'ascii');
    buffer.writeUInt32LE(36 + dataBytes, 4);
    buffer.write('WAVE', 8, 'ascii');
    buffer.write('fmt ', 12, 'ascii');
    buffer.writeUInt32LE(16, 16);
    // Integer PCM, one channel, 16 bits.
    buffer.writeUInt16LE(1, 20);
    buffer.writeUInt16LE(1, 22);
    buffer.writeUInt32LE(sampleRate, 24);
    buffer.writeUInt32LE(sampleRate * 2, 28);
    buffer.writeUInt16LE(2, 32);
    buffer.writeUInt16LE(16, 34);
    buffer.write('data', 36, 'ascii');
    buffer.writeUInt32LE(dataBytes, 40);
    for (let i = 0; i < samples.length; i++) {
        const clipped = Math.max(-1, Math.min(1, samples[i]));
        buffer.writeInt16LE(Math.round(clipped * 32767), 44 + i * 2);
    }
    return buffer;
}
