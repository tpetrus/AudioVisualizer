import { describe, expect, it } from 'vitest';
import { CHARACTER_REGISTRY, DEFAULT_CHARACTER_ID, findCharacter } from './characterRegistry';
import { BODY_MATERIAL_NAMES } from './dancingCharacterConfig';

describe('CHARACTER_REGISTRY', () => {
    it('lists MakeHuman first and it is the default', () => {
        expect(CHARACTER_REGISTRY[0].id).toBe('makehuman');
        expect(DEFAULT_CHARACTER_ID).toBe('makehuman');
        expect(findCharacter(DEFAULT_CHARACTER_ID)).toBe(CHARACTER_REGISTRY[0]);
    });

    it('has unique ids', () => {
        const ids = CHARACTER_REGISTRY.map((entry) => entry.id);
        expect(new Set(ids).size).toBe(ids.length);
    });

    it('gives every entry what the attribution and the loader need', () => {
        for (const entry of CHARACTER_REGISTRY) {
            expect(entry.title).not.toBe('');
            expect(['CC0', 'CC-BY', 'CC-BY-SA']).toContain(entry.license);
            expect(entry.licenseVersion).not.toBe('');
            expect(entry.sourceUrl).toMatch(/^https:\/\//);
            expect(entry.modifiedNote).not.toBe('');
            expect(entry.urls.model).not.toBe('');
            expect(entry.urls.dances).not.toBe('');
            expect(entry.bodyMaterialNames.length).toBeGreaterThan(0);
            // A license that needs a credit names its author; only the CC0 entries may leave it empty.
            if (entry.license !== 'CC0') expect(entry.author).not.toBe('');
        }
    });

    it('describes MakeHuman as CC0 and tints the default body material', () => {
        const makehuman = CHARACTER_REGISTRY[0];
        expect(makehuman).toMatchObject({ license: 'CC0', author: '' });
        expect(makehuman.bodyMaterialNames).toEqual(BODY_MATERIAL_NAMES);
    });

    it('finds an entry in an injected list, or nothing', () => {
        const entry = { ...CHARACTER_REGISTRY[0], id: 'other' };
        expect(findCharacter('other', [entry])).toBe(entry);
        expect(findCharacter('other')).toBeUndefined();
    });
});
