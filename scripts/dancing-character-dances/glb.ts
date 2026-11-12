// Writes the clips as an animation-only GLB. There is one flat node per animated bone, named the way GLTFLoader names
// the dancing model's bones ('upperarm01L'), so the tracks are '<bone>.quaternion' and 'root.position' and a mixer on
// the dancing model binds them to its bones. The container is written by hand (JSON chunk + BIN chunk, 4-byte aligned).

import type { Clip } from './clip';

const FLOAT = 5126;

interface Accessor {
    bufferView: number;
    componentType: number;
    count: number;
    type: 'SCALAR' | 'VEC3' | 'VEC4';
    min?: number[];
    max?: number[];
}

export function writeAnimationGlb(clips: Clip[], nodeNames: string[]): Buffer {
    const chunks: Buffer[] = [];
    const bufferViews: { buffer: number; byteOffset: number; byteLength: number }[] = [];
    const accessors: Accessor[] = [];
    let offset = 0;
    const add = (data: Float32Array, count: number, type: Accessor['type'], range?: boolean): number => {
        const bytes = Buffer.from(data.buffer, data.byteOffset, data.byteLength);
        bufferViews.push({ buffer: 0, byteOffset: offset, byteLength: bytes.length });
        chunks.push(bytes);
        offset += bytes.length;
        const accessor: Accessor = { bufferView: bufferViews.length - 1, componentType: FLOAT, count, type };
        if (range) {
            accessor.min = [data[0]];
            accessor.max = [data[count - 1]];
        }
        accessors.push(accessor);
        return accessors.length - 1;
    };
    // Every animated bone gets one node, in the order given.
    const nodeIndex = new Map(nodeNames.map((name, i) => [name, i]));
    const animations = clips.map((clip) => {
        const input = add(clip.times, clip.keys, 'SCALAR', true);
        const samplers: { input: number; output: number; interpolation: string }[] = [];
        const channels: { sampler: number; target: { node: number; path: string } }[] = [];
        for (const [name, track] of clip.quaternions) {
            const node = nodeIndex.get(name);
            if (node === undefined) throw new Error(`no node for ${name}`);
            samplers.push({ input, output: add(track, clip.keys, 'VEC4'), interpolation: 'LINEAR' });
            channels.push({ sampler: samplers.length - 1, target: { node, path: 'rotation' } });
        }
        samplers.push({ input, output: add(clip.rootPosition, clip.keys, 'VEC3'), interpolation: 'LINEAR' });
        channels.push({
            sampler: samplers.length - 1,
            target: { node: nodeIndex.get('root') as number, path: 'translation' },
        });
        return { name: clip.id, samplers, channels };
    });
    const json = {
        asset: { version: '2.0', generator: 'dancing-character-dances' },
        scene: 0,
        scenes: [{ nodes: nodeNames.map((_, i) => i) }],
        nodes: nodeNames.map((name) => ({ name })),
        buffers: [{ byteLength: offset }],
        bufferViews,
        accessors,
        animations,
    };
    const jsonBytes = Buffer.from(JSON.stringify(json), 'utf8');
    const jsonPadded = Buffer.concat([jsonBytes, Buffer.alloc((4 - (jsonBytes.length % 4)) % 4, 0x20)]);
    const bin = Buffer.concat(chunks);
    const binPadded = Buffer.concat([bin, Buffer.alloc((4 - (bin.length % 4)) % 4, 0)]);
    const total = 12 + 8 + jsonPadded.length + 8 + binPadded.length;
    const header = Buffer.alloc(12);
    header.writeUInt32LE(0x46546c67, 0);
    header.writeUInt32LE(2, 4);
    header.writeUInt32LE(total, 8);
    const chunkHeader = (length: number, type: number): Buffer => {
        const h = Buffer.alloc(8);
        h.writeUInt32LE(length, 0);
        h.writeUInt32LE(type, 4);
        return h;
    };
    return Buffer.concat([
        header,
        chunkHeader(jsonPadded.length, 0x4e4f534a),
        jsonPadded,
        chunkHeader(binPadded.length, 0x004e4942),
        binPadded,
    ]);
}
