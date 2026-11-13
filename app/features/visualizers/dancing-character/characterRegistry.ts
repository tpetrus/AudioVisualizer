import { BODY_MATERIAL_NAMES } from './dancingCharacterConfig';
import dancesUrl from './assets/MakeHumanDances.glb?url';
import modelUrl from './assets/MakeHumanDancer.glb?url';
import warioDancesUrl from './assets/characters/wario/dances.glb?url';
import warioModelUrl from './assets/characters/wario/model.glb?url';
import mrIncredibleDancesUrl from './assets/characters/mr-incredible/dances.glb?url';
import mrIncredibleModelUrl from './assets/characters/mr-incredible/model.glb?url';

export interface CharacterEntry {
    id: string;
    // Shown in the Character select and in the attribution.
    title: string;
    // Empty when the model has no individual author (MakeHuman is credited to its project).
    author: string;
    license: 'CC0' | 'CC-BY' | 'CC-BY-SA';
    licenseVersion: string;
    sourceUrl: string;
    // What was changed from the original, in one sentence, as the license asks.
    modifiedNote: string;
    trademarkNote?: string;
    urls: { model: string; dances: string };
    // The materials the Skin tint colors.
    bodyMaterialNames: readonly string[];
}

export const DEFAULT_CHARACTER_ID = 'makehuman';

// MakeHuman first: it is the default and the fallback when another character fails to load.
export const CHARACTER_REGISTRY: readonly CharacterEntry[] = [
    {
        id: DEFAULT_CHARACTER_ID,
        title: 'MakeHuman',
        author: '',
        license: 'CC0',
        licenseVersion: '1.0',
        sourceUrl: 'https://github.com/makehumancommunity/makehuman',
        modifiedNote:
            'Converted to glTF, fitted with an outfit, skinned to one skeleton, materials rebuilt. Dances retargeted from CMU motion capture.',
        urls: { model: modelUrl, dances: dancesUrl },
        bodyMaterialNames: BODY_MATERIAL_NAMES,
    },
    {
        id: 'mr-incredible',
        title: 'Mr Incredible',
        author: 'Crias',
        license: 'CC-BY',
        licenseVersion: '3.0',
        sourceUrl: 'https://blendswap.com/blend/11590',
        modifiedNote:
            'Converted to glTF, rig rebuilt on the MakeHuman skeleton, materials rebuilt. Dances retargeted from CMU motion capture.',
        trademarkNote: 'Mr Incredible is a character of Disney/Pixar; this is unofficial fan art.',
        urls: { model: mrIncredibleModelUrl, dances: mrIncredibleDancesUrl },
        // The only skin-colored part of the model is the face; the rest is his costume.
        bodyMaterialNames: BODY_MATERIAL_NAMES,
    },
    {
        id: 'wario',
        title: 'Wario',
        author: 'Bagiryu',
        license: 'CC0',
        licenseVersion: '1.0',
        sourceUrl: 'https://blendswap.com/blend/10017',
        modifiedNote:
            'Converted to glTF, rig rebuilt on the MakeHuman skeleton, materials rebuilt. Dances retargeted from CMU motion capture.',
        trademarkNote: 'Wario is a character of Nintendo; this is unofficial fan art.',
        urls: { model: warioModelUrl, dances: warioDancesUrl },
        bodyMaterialNames: BODY_MATERIAL_NAMES,
    },
];

export function findCharacter(
    id: string,
    registry: readonly CharacterEntry[] = CHARACTER_REGISTRY,
): CharacterEntry | undefined {
    return registry.find((entry) => entry.id === id);
}
