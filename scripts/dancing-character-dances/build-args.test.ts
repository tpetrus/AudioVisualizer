import { describe, expect, it } from 'vitest';
import { resolve } from 'node:path';
import { DEFAULT_MODEL, DEFAULT_OUTPUT, REQUIRED_BONES, missingBones, parseBuildArgs } from './build-args';

describe('REQUIRED_BONES', () => {
    it('lists the 42 contract bones once each', () => {
        expect(REQUIRED_BONES).toHaveLength(42);
        expect(new Set(REQUIRED_BONES).size).toBe(42);
        expect(REQUIRED_BONES).toContain('toe1-1R');
        expect(REQUIRED_BONES).toContain('finger5-1L');
    });
});

describe('missingBones', () => {
    it('is empty for a complete rig and names every absent bone otherwise', () => {
        expect(missingBones([...REQUIRED_BONES, 'extra'])).toEqual([]);
        const partial = REQUIRED_BONES.filter((n) => n !== 'head' && n !== 'wristL');
        expect(missingBones(partial)).toEqual(['head', 'wristL']);
        expect(missingBones([])).toEqual([...REQUIRED_BONES]);
    });
});

describe('parseBuildArgs', () => {
    it('defaults to the MakeHuman model and output', () => {
        expect(parseBuildArgs([])).toEqual({
            dir: undefined,
            model: DEFAULT_MODEL,
            out: DEFAULT_OUTPUT,
            defaultModel: true,
            approved: undefined,
        });
    });
    it('reads the input directory, --out and --approved in any order', () => {
        const a = parseBuildArgs(['--out', 'o.glb', 'inputs', '--approved', 'spike.glb']);
        expect(a.dir).toBe(resolve('inputs'));
        expect(a.out).toBe(resolve('o.glb'));
        expect(a.approved).toBe('spike.glb');
        expect(a.defaultModel).toBe(true);
    });
    it('writes dances.glb next to a custom model unless --out says otherwise', () => {
        const a = parseBuildArgs(['--model', 'chars/ada/model.glb']);
        expect(a.defaultModel).toBe(false);
        expect(a.model).toBe(resolve('chars/ada/model.glb'));
        expect(a.out).toBe(resolve('chars/ada/dances.glb'));
        expect(parseBuildArgs(['--model', 'm.glb', '--out', 'x/y.glb']).out).toBe(resolve('x/y.glb'));
    });
    it('treats an explicit default model path as the default model', () => {
        expect(parseBuildArgs(['--model', DEFAULT_MODEL]).defaultModel).toBe(true);
    });
    it('rejects unknown options and options without a value', () => {
        expect(() => parseBuildArgs(['--nope'])).toThrow('unknown option --nope');
        expect(() => parseBuildArgs(['--model'])).toThrow('--model needs a value');
        expect(() => parseBuildArgs(['--out', '--model', 'a.glb'])).toThrow('--out needs a value');
    });
});
