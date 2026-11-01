// Reads the MakeHuman CC0 clothes proxies (.mhclo + .obj + .mhmat + diffuse texture) and fits them onto the base mesh.
// Everything here is parsing and geometry on the raw MakeHuman data; the glTF writing lives in glb.ts.
//
// A .mhclo does not store garment vertices. Each garment vertex is described relative to the base mesh: either a copy
// of one base vertex, or a weighted average of three base vertices plus an offset that is scaled by how large the
// body is (so the same garment fits bodies of any proportions). Fitting it on the default base mesh gives the
// garment's rest shape.

import sharp from 'sharp';
import { readInput, readInputBytes } from './makehuman';

// The CC0 MakeHuman system asset pack the files come from, as MakeHuman 2 itself downloads it
// (makehumancommunity/makehuman2, data/makehuman2_version.json).
export const OUTFIT_PACK_URL =
    'https://mirror1.makehuman.net/asset_packs/makehuman_system_assets/makehuman_system_assets_cc0.zip';
export const OUTFIT_PACK_SHA256 = 'b542127a8e25547c7c29c19f2d1d2adb9a664c80396ecd694095dbc8028a0107';

interface Input {
    file: string;
    sha256: string;
}

export interface GarmentSource {
    // Used as the mesh name; the material gets `materialName` (the body material is "Skin", so never that).
    name: string;
    materialName: string;
    clothes: Input;
    obj: Input;
    material: Input;
    texture: Input;
    // Present only to be hash-checked: the blended body weights are used instead (see fitGarment).
    extra: Input[];
    textureSize: number;
    textureFormat: 'jpeg' | 'png';
    roughness: number;
    // Hair is a card with a cutout: the texture's alpha is thresholded and both sides are drawn.
    cutout: boolean;
}

export const GARMENTS: GarmentSource[] = [
    {
        name: 'Outfit',
        materialName: 'Outfit',
        clothes: {
            file: 'male_casualsuit06.mhclo',
            sha256: '9cebda22a0fa57fc556a1a77723f59b176724dc7e987c01214283677444ddcc5',
        },
        obj: {
            file: 'male_casualsuit06.obj',
            sha256: '9a86386435d7557a520320b8db4cd0ffe4755040044d1925c2b5730b864a603e',
        },
        material: {
            file: 'male_casualsuit06.mhmat',
            sha256: '2210d331d0e319147280363e281a4e98d24b71e678dac243d1250f5d27e9169f',
        },
        texture: {
            file: 'male_casualsuit06_diffuse.png',
            sha256: 'e9a581e0d4eb64c7a031886f2faf109a4703a3046a5fcc97ea9ce9112e99a344',
        },
        extra: [],
        textureSize: 1024,
        textureFormat: 'jpeg',
        roughness: 0.85,
        cutout: false,
    },
    {
        name: 'Shoes',
        materialName: 'Shoes',
        clothes: {
            file: 'shoes06.mhclo',
            sha256: 'c39144d8d9073474fb00a098954e6c4d8cc68c95ff6404eb3a984dd7870be3fd',
        },
        obj: { file: 'shoes06.obj', sha256: '5726aabac42ff489998d0a769545dea013961bbb71b9c6024d75170181a98818' },
        material: {
            file: 'shoes06.mhmat',
            sha256: '964f6279aa28cbb4da83d84e71328f31cf50c2831eaffa11c6c2077f96278611',
        },
        texture: {
            file: 'shoes06_diffuse.png',
            sha256: '0be0432efcd3be47c8e6f0015acd7f685735190be6bb8533ceca60b56cc269d1',
        },
        extra: [{ file: 'shoes06.mhw', sha256: '4dddd303436b344bc2ee8142cde9b2f40d4086ea373e2330092a3af055368c5f' }],
        textureSize: 512,
        textureFormat: 'jpeg',
        roughness: 0.6,
        cutout: false,
    },
    {
        name: 'Hair',
        materialName: 'Hair',
        clothes: {
            file: 'short02.mhclo',
            sha256: '625736cdb73e6d094df6e5a2df18f371781f1d2cd37b0ae15795c5d7051c3ec2',
        },
        obj: { file: 'short02.obj', sha256: '48f979114adfa712165a69cc55c45a70831af1fb3cba8e2a89120f0c87407b64' },
        material: {
            file: 'short02.mhmat',
            sha256: '2ed04c8aad9c1a35d858ca72091525d32b1da3b61b5a031634dd528fd8530f6d',
        },
        texture: {
            file: 'short02_diffuse.png',
            sha256: '47fe33831a3929567c733356dd66243116e05df2ace1f884ddca0080b728229f',
        },
        extra: [],
        textureSize: 512,
        textureFormat: 'png',
        roughness: 0.7,
        cutout: true,
    },
    {
        name: 'Eyes',
        materialName: 'Eyes',
        clothes: {
            file: 'low-poly.mhclo',
            sha256: '68582e28e9176cba7cfcf35208f671b6201b8d1bc95c32decff61a3160ec34d8',
        },
        obj: { file: 'low-poly.obj', sha256: '783fe1e6331162c876520b4c2bed7a8ca06354ca15497e8ebd68bb1b59f4d3de' },
        // low-poly.mhclo names "../materials/brown.mhmat"; the pack is flattened, so it is resolved by basename.
        material: {
            file: 'brown.mhmat',
            sha256: '4abad93ce50541c08127721e77bce035640c9f16bed16cd0f5524b1cd5908465',
        },
        texture: {
            file: 'brown_eye.png',
            sha256: '4659691c7295ad6206c78b003e5fd0e5f91dcd53032fa914a229bb48cabe424b',
        },
        extra: [],
        textureSize: 256,
        textureFormat: 'jpeg',
        roughness: 0.25,
        cutout: false,
    },
];

// The alpha cutoff for the hair card: texels less than half opaque are discarded.
export const HAIR_ALPHA_CUTOFF = 0.5;

interface Reference {
    // One index is a plain copy of that base vertex; three are blended by `weights`.
    indices: number[];
    weights: number[];
    offset: [number, number, number];
}

export interface Clothes {
    objFile: string;
    materialFile: string;
    // [vertexA, vertexB, divisor] per axis: the scale is |base[a] - base[b]| / divisor along that axis.
    scales: [number, number, number][];
    references: Reference[];
    deleteVerts: Set<number>;
}

export function parseClothes(text: string): Clothes {
    const clothes: Clothes = {
        objFile: '',
        materialFile: '',
        scales: [
            [0, 0, 1],
            [0, 0, 1],
            [0, 0, 1],
        ],
        references: [],
        deleteVerts: new Set(),
    };
    let mode: 'header' | 'verts' | 'delete' = 'header';
    for (const raw of text.split('\n')) {
        const line = raw.trim();
        if (line === '' || line.startsWith('#')) continue;
        const parts = line.split(/\s+/);
        if (/^[a-z_]+$/.test(parts[0])) {
            // A keyword line. "material" and friends may come after "verts 0", so keywords are read in every mode.
            if (parts[0] === 'verts') mode = 'verts';
            else if (parts[0] === 'delete_verts') mode = 'delete';
            else if (parts[0] === 'obj_file') clothes.objFile = parts[1];
            else if (parts[0] === 'material') clothes.materialFile = parts[1].split('/').pop() as string;
            else if (parts[0] === 'x_scale') clothes.scales[0] = [Number(parts[1]), Number(parts[2]), Number(parts[3])];
            else if (parts[0] === 'y_scale') clothes.scales[1] = [Number(parts[1]), Number(parts[2]), Number(parts[3])];
            else if (parts[0] === 'z_scale') clothes.scales[2] = [Number(parts[1]), Number(parts[2]), Number(parts[3])];
            continue;
        }
        if (mode === 'verts') {
            const numbers = parts.map(Number);
            if (numbers.some(Number.isNaN)) throw new Error(`bad reference line "${line}"`);
            if (parts.length === 1) {
                clothes.references.push({ indices: [numbers[0]], weights: [1], offset: [0, 0, 0] });
            } else if (parts.length === 9) {
                clothes.references.push({
                    indices: numbers.slice(0, 3),
                    weights: numbers.slice(3, 6),
                    offset: [numbers[6], numbers[7], numbers[8]],
                });
            } else {
                throw new Error(`reference line has ${parts.length} fields: "${line}"`);
            }
        } else if (mode === 'delete') {
            // "a - b" ranges (inclusive) and single numbers, mixed on each line.
            const tokens = line.replace(/\s*-\s*/g, '-').split(/\s+/);
            for (const token of tokens) {
                const [from, to = from] = token.split('-').map(Number);
                if (Number.isNaN(from) || Number.isNaN(to)) throw new Error(`bad delete_verts token "${token}"`);
                for (let i = from; i <= to; i++) clothes.deleteVerts.add(i);
            }
        }
    }
    if (clothes.references.length === 0) throw new Error('clothes file has no vertex references');
    return clothes;
}

export interface ProxyMesh {
    vertexCount: number;
    // Per proxy vertex position is not stored in the obj used here; the fit supplies it. Triangles are corner pairs.
    // Each corner is [vertex index, uv index]; three corners per triangle.
    corners: [number, number][];
    uvs: Float64Array;
}

export function parseProxyObj(text: string): ProxyMesh {
    let vertexCount = 0;
    const uvs: number[] = [];
    const corners: [number, number][] = [];
    for (const line of text.split('\n')) {
        const parts = line.trim().split(/\s+/);
        if (parts[0] === 'v') vertexCount++;
        else if (parts[0] === 'vt') uvs.push(Number(parts[1]), Number(parts[2]));
        else if (parts[0] === 'f') {
            const face = parts.slice(1).map((corner): [number, number] => {
                const [v, vt] = corner.split('/');
                return [Number(v) - 1, Number(vt) - 1];
            });
            for (let i = 1; i + 1 < face.length; i++) corners.push(face[0], face[i], face[i + 1]);
        }
    }
    return { vertexCount, corners, uvs: Float64Array.from(uvs) };
}

export interface Garment {
    name: string;
    materialName: string;
    roughness: number;
    cutout: boolean;
    // Fitted positions in MakeHuman units, one triple per proxy vertex.
    positions: Float64Array;
    corners: [number, number][];
    // Texture coordinates already in glTF's top-down convention.
    uvs: Float64Array;
    // Per proxy vertex: the body's skin weights blended over the reference vertices, [boneName, weight] pairs.
    influences: [string, number][][];
    deleteVerts: Set<number>;
    texture: { data: Buffer; mimeType: string; width: number; height: number };
}

// Fits the proxy onto the base mesh (positions in MakeHuman units) and blends the body's weights for each vertex.
export function fitGarment(
    source: GarmentSource,
    clothes: Clothes,
    proxy: ProxyMesh,
    base: Float64Array,
    baseWeights: Map<number, [string, number][]>,
    texture: Garment['texture'],
): Garment {
    if (clothes.references.length !== proxy.vertexCount) {
        throw new Error(`${source.name}: ${clothes.references.length} references for ${proxy.vertexCount} vertices`);
    }
    const scale = clothes.scales.map(
        ([a, b, divisor], axis) => Math.abs(base[a * 3 + axis] - base[b * 3 + axis]) / divisor,
    );
    const baseCount = base.length / 3;
    const positions = new Float64Array(proxy.vertexCount * 3);
    const influences: [string, number][][] = [];
    clothes.references.forEach((reference, v) => {
        for (const index of reference.indices) {
            if (index < 0 || index >= baseCount) throw new Error(`${source.name}: base vertex ${index} out of range`);
        }
        for (let axis = 0; axis < 3; axis++) {
            let value = reference.offset[axis] * scale[axis];
            reference.indices.forEach((index, k) => {
                value += reference.weights[k] * base[index * 3 + axis];
            });
            positions[v * 3 + axis] = value;
        }
        // Blend the body's weights by the reference weights. A negative barycentric weight (the point lies outside the
        // triangle) is dropped; if none is positive the heaviest reference alone decides.
        const blend = new Map<string, number>();
        const positive = reference.weights.map((w) => Math.max(w, 0));
        if (!positive.some((w) => w > 0)) positive[reference.weights.indexOf(Math.max(...reference.weights))] = 1;
        reference.indices.forEach((index, k) => {
            for (const [bone, weight] of baseWeights.get(index) ?? []) {
                blend.set(bone, (blend.get(bone) ?? 0) + positive[k] * weight);
            }
        });
        const entries = [...blend].filter(([, weight]) => weight > 0);
        if (entries.length === 0) throw new Error(`${source.name}: vertex ${v} has no skin weights`);
        influences.push(entries);
    });
    // MakeHuman's v runs bottom-up, glTF's top-down.
    const uvs = Float64Array.from(proxy.uvs, (value, i) => (i % 2 === 1 ? 1 - value : value));
    return {
        name: source.name,
        materialName: source.materialName,
        roughness: source.roughness,
        cutout: source.cutout,
        positions,
        corners: proxy.corners,
        uvs,
        influences,
        deleteVerts: clothes.deleteVerts,
        texture,
    };
}

// Downscales the diffuse texture to a square-bounded size. JPEG has no alpha, so it is flattened onto white (only the
// hair uses PNG, for its cutout). Deterministic for a given sharp/libvips build.
async function prepareTexture(bytes: Buffer, source: GarmentSource): Promise<Garment['texture']> {
    const resized = sharp(bytes).resize(source.textureSize, source.textureSize, {
        fit: 'inside',
        withoutEnlargement: true,
        kernel: 'lanczos3',
    });
    const encoded =
        source.textureFormat === 'jpeg'
            ? resized.flatten({ background: '#ffffff' }).jpeg({ quality: 88, mozjpeg: false, progressive: false })
            : resized.png({ compressionLevel: 9, palette: true, quality: 90, effort: 10 });
    const { data, info } = await encoded.toBuffer({ resolveWithObject: true });
    return {
        data,
        mimeType: source.textureFormat === 'jpeg' ? 'image/jpeg' : 'image/png',
        width: info.width,
        height: info.height,
    };
}

// Reads, hash-checks, parses and fits every garment in the outfit folder.
export async function loadOutfit(
    dir: string,
    base: Float64Array,
    baseWeights: Map<number, [string, number][]>,
): Promise<Garment[]> {
    const garments: Garment[] = [];
    for (const source of GARMENTS) {
        const clothes = parseClothes(readInput(dir, source.clothes));
        if (clothes.objFile !== source.obj.file)
            throw new Error(`${source.name}: unexpected obj_file ${clothes.objFile}`);
        if (clothes.materialFile !== source.material.file) {
            throw new Error(`${source.name}: unexpected material ${clothes.materialFile}`);
        }
        const proxy = parseProxyObj(readInput(dir, source.obj));
        readInput(dir, source.material);
        for (const extra of source.extra) readInput(dir, extra);
        const texture = await prepareTexture(readInputBytes(dir, source.texture), source);
        garments.push(fitGarment(source, clothes, proxy, base, baseWeights, texture));
    }
    return garments;
}
