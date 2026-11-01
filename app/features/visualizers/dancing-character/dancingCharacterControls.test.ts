import { describe, expect, it } from 'vitest';
import {
    controlsForMotionPreference,
    dancingCharacterControls,
    dancingCharacterReducedMotionControls,
} from './dancingCharacterControls';
import { defaultValues } from '~/components/ControlPanel/controls';

describe('dancingCharacterControls', () => {
    it('has the settings the plan freezes, with their defaults', () => {
        expect(defaultValues(dancingCharacterControls)).toEqual({
            danceSpeed: 1,
            autoOrbit: true,
            orbitSpeed: 1,
            zoom: 1,
            bassStrength: 1,
            bodyColor: '#ffffff',
            accentColor: '#ff7ab6',
            floorColor: '#2b3a55',
        });
    });

    it('steps the dance speed through half time, on the beat and double time', () => {
        const danceSpeed = dancingCharacterControls.find((control) => control.key === 'danceSpeed');
        expect(danceSpeed).toMatchObject({ min: 0.5, max: 2, step: 0.5 });
    });

    it('lowers only the orbit speed and bass bump defaults for reduced motion', () => {
        expect(defaultValues(dancingCharacterReducedMotionControls)).toEqual({
            ...defaultValues(dancingCharacterControls),
            orbitSpeed: 0.5,
            bassStrength: 0.5,
        });
        expect(dancingCharacterReducedMotionControls.map((control) => control.key)).toEqual(
            dancingCharacterControls.map((control) => control.key),
        );
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
