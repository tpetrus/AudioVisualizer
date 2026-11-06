import { describe, expect, it } from 'vitest';
import {
    controlsForMotionPreference,
    dancingCharacterControls,
    dancingCharacterReducedMotionControls,
} from './dancingCharacterControls';
import { defaultValues, isShown } from '~/components/ControlPanel/controls';

describe('dancingCharacterControls', () => {
    it('has the settings the plan freezes, with their defaults', () => {
        expect(defaultValues(dancingCharacterControls)).toEqual({
            danceSpeed: 1,
            autoOrbit: true,
            orbitSpeed: 1,
            zoom: 0.75,
            bassStrength: 1,
            bassCameraStrength: 0.4,
            bodyColor: '#ffffff',
            accentRainbow: true,
            rainbowSpeed: 0.1,
            accentColor: '#ff7ab6',
            floorColor: '#2b3a55',
        });
    });

    it('steps the dance speed through half time and on the beat', () => {
        const danceSpeed = dancingCharacterControls.find((control) => control.key === 'danceSpeed');
        expect(danceSpeed).toMatchObject({ min: 0.5, max: 1, step: 0.5 });
    });

    it('has a camera bump slider that can be switched off', () => {
        const control = dancingCharacterControls.find((c) => c.key === 'bassCameraStrength');
        expect(control).toMatchObject({ section: 'Bass', label: 'Camera bump', min: 0, max: 1, step: 0.05 });
    });

    it('lowers only the orbit speed, bass glow, camera bump and rainbow speed defaults for reduced motion', () => {
        expect(defaultValues(dancingCharacterReducedMotionControls)).toEqual({
            ...defaultValues(dancingCharacterControls),
            orbitSpeed: 0.5,
            bassStrength: 0.5,
            bassCameraStrength: 0.2,
            rainbowSpeed: 0.05,
        });
        expect(dancingCharacterReducedMotionControls.map((control) => control.key)).toEqual(
            dancingCharacterControls.map((control) => control.key),
        );
    });
});

describe('accent controls', () => {
    it('shows the rainbow speed only in rainbow mode and the static accent color only outside it', () => {
        const speed = dancingCharacterControls.find((control) => control.key === 'rainbowSpeed')!;
        const accent = dancingCharacterControls.find((control) => control.key === 'accentColor')!;
        const values = defaultValues(dancingCharacterControls);
        expect(isShown(speed, values)).toBe(true);
        expect(isShown(accent, values)).toBe(false);
        const staticValues = { ...values, accentRainbow: false };
        expect(isShown(speed, staticValues)).toBe(false);
        expect(isShown(accent, staticValues)).toBe(true);
    });
});

describe('controlsForMotionPreference', () => {
    it('picks the reduced-motion table when the media query matches', () => {
        expect(controlsForMotionPreference(() => ({ matches: true }))).toBe(dancingCharacterReducedMotionControls);
    });

    it('picks the normal table when it does not match or matchMedia is missing', () => {
        expect(controlsForMotionPreference(() => ({ matches: false }))).toBe(dancingCharacterControls);
        expect(controlsForMotionPreference(undefined)).toBe(dancingCharacterControls);
    });

    it('reads the real matchMedia by default', () => {
        // Node has no matchMedia, so the default argument resolves to undefined there.
        expect(controlsForMotionPreference()).toBe(dancingCharacterControls);
    });
});
