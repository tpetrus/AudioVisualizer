import type { ControlDefinition, ControlValues } from '~/components/ControlPanel/controls';
import { CHARACTER_REGISTRY, DEFAULT_CHARACTER_ID } from './characterRegistry';
import { AUTO_DANCE, CALM_DANCE_ID, DANCES } from './dancingCharacterConfig';

const characterOptions = CHARACTER_REGISTRY.map((entry) => ({ value: entry.id, label: entry.title }));

// Auto first, then every dance in the order the Auto rotation plays them.
const danceOptions = [
    { value: AUTO_DANCE, label: 'Auto' },
    ...DANCES.map((dance) => ({ value: dance.id, label: dance.label })),
];

// Ordered dance, camera, bass, colors, so the panel reads from what moves the most to what only changes the look.
export const dancingCharacterControls = [
    // Which figure dances. Not remembered: every visit starts with the default.
    {
        section: 'Character',
        key: 'character',
        label: 'Character',
        type: 'select',
        options: characterOptions,
        default: DEFAULT_CHARACTER_ID,
    },
    // Auto lets the dancer change dance by herself; any other value keeps that one dance.
    { section: 'Dance', key: 'dance', label: 'Dance', type: 'select', options: danceOptions, default: AUTO_DANCE },
    // While the tempo is locked the dance speed snaps to half time (0.5) or on the beat (1), so the steps stay on
    // the beat; a tempo over the dance speed limit is halved further. While the tempo is unknown it scales the calm
    // default rate, capped at the same limit.
    {
        section: 'Dance',
        key: 'danceSpeed',
        label: 'Dance speed',
        type: 'range',
        min: 0.5,
        max: 1,
        step: 0.5,
        default: 1,
    },
    { section: 'Camera', key: 'autoOrbit', label: 'Orbit around the dancer', type: 'checkbox', default: true },
    {
        section: 'Camera',
        key: 'orbitSpeed',
        label: 'Orbit speed',
        type: 'range',
        min: 0,
        max: 2,
        step: 0.05,
        default: 1,
        shownWhen: 'autoOrbit',
    },
    // 1 frames the whole body tightly; lower values move the camera back (the default leaves room around the dancer and
    // the floor), higher values move it closer.
    { section: 'Camera', key: 'zoom', label: 'Zoom', type: 'range', min: 0.5, max: 2, step: 0.05, default: 0.75 },
    // How strongly the bass flashes the rim light on the dancer; the dancer never changes size.
    {
        section: 'Bass',
        key: 'bassStrength',
        label: 'Bass glow',
        type: 'range',
        min: 0,
        max: 2,
        step: 0.05,
        default: 1,
    },
    // 0 turns the camera push off; the push is a fraction of the fitted distance, so it holds at any aspect ratio.
    {
        section: 'Bass',
        key: 'bassCameraStrength',
        label: 'Camera bump',
        type: 'range',
        min: 0,
        max: 1,
        step: 0.05,
        default: 0.4,
    },
    // White multiplies the model's own colors by one, so the default keeps the skin color the model ships with.
    { section: 'Colors', key: 'bodyColor', label: 'Skin tint', type: 'color', default: '#ffffff' },
    // The accent (the floor's beat ripple and the rim light) cycles through the hues by default; turning the rainbow off
    // uses the static accent color instead. The speed is in full color cycles per second.
    { section: 'Colors', key: 'accentRainbow', label: 'Rainbow accent', type: 'checkbox', default: true },
    {
        section: 'Colors',
        key: 'rainbowSpeed',
        label: 'Rainbow speed',
        type: 'range',
        min: 0.01,
        max: 0.5,
        step: 0.01,
        default: 0.1,
        shownWhen: 'accentRainbow',
    },
    {
        section: 'Colors',
        key: 'accentColor',
        label: 'Accent',
        type: 'color',
        default: '#ff7ab6',
        shownWhen: '!accentRainbow',
    },
    { section: 'Colors', key: 'floorColor', label: 'Floor', type: 'color', default: '#2b3a55' },
] as const satisfies readonly ControlDefinition[];

// The same controls with calmer motion defaults, used when the user asks the system for reduced motion. A separate
// module-level table rather than changed defaults at runtime, because useControlValues needs a constant table.
export const dancingCharacterReducedMotionControls = dancingCharacterControls.map((control) => {
    switch (control.key) {
        // Reduced motion starts on the calm dance and does not rotate; the visitor may still choose another.
        case 'dance':
            return { ...control, default: CALM_DANCE_ID as string };
        case 'orbitSpeed':
            return { ...control, default: 0.5 };
        case 'bassStrength':
            return { ...control, default: 0.5 };
        case 'bassCameraStrength':
            return { ...control, default: 0.2 };
        case 'rainbowSpeed':
            return { ...control, default: 0.05 };
        default:
            return control;
    }
    // Only defaults change, never keys or types, so the values have the same shape as the main table's. The cast keeps
    // the literal types `ControlValues` reads the keys from.
}) as unknown as typeof dancingCharacterControls;

export type DancingCharacterSettings = ControlValues<typeof dancingCharacterControls>;

// The table to use for this visitor, read once when the page mounts.
export function controlsForMotionPreference(
    matchMedia: ((query: string) => { matches: boolean }) | undefined = globalThis.matchMedia?.bind(globalThis),
): typeof dancingCharacterControls {
    const reduced = matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    return reduced ? dancingCharacterReducedMotionControls : dancingCharacterControls;
}
