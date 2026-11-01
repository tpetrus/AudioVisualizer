import type { ControlDefinition, ControlValues } from '~/components/ControlPanel/controls';

// Ordered dance, camera, bass, colors, so the panel reads from what moves the most to what only changes the look.
export const dancingCharacterControls = [
    // While the tempo is locked the dance speed snaps to half time (0.5), on the beat (1) or double time (2), so the
    // steps stay on the beat. While the tempo is unknown it scales the calm default rate freely.
    {
        section: 'Dance',
        key: 'danceSpeed',
        label: 'Dance speed',
        type: 'range',
        min: 0.5,
        max: 2,
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
    // 1 frames the whole body; higher values move the camera closer.
    { section: 'Camera', key: 'zoom', label: 'Zoom', type: 'range', min: 0.5, max: 2, step: 0.05, default: 1 },
    {
        section: 'Bass',
        key: 'bassStrength',
        label: 'Bass bump',
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
        default: 0.6,
    },
    // White multiplies the model's own colors by one, so the default keeps the skin color the model ships with.
    { section: 'Colors', key: 'bodyColor', label: 'Skin tint', type: 'color', default: '#ffffff' },
    { section: 'Colors', key: 'accentColor', label: 'Accent', type: 'color', default: '#ff7ab6' },
    { section: 'Colors', key: 'floorColor', label: 'Floor', type: 'color', default: '#2b3a55' },
] as const satisfies readonly ControlDefinition[];

// The same controls with calmer motion defaults, used when the user asks the system for reduced motion. A separate
// module-level table rather than changed defaults at runtime, because useControlValues needs a constant table.
export const dancingCharacterReducedMotionControls = dancingCharacterControls.map((control) => {
    switch (control.key) {
        case 'orbitSpeed':
            return { ...control, default: 0.5 };
        case 'bassStrength':
            return { ...control, default: 0.5 };
        case 'bassCameraStrength':
            return { ...control, default: 0.2 };
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
