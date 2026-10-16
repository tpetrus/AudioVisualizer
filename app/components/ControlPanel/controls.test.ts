import { describe, expect, it } from 'vitest';
import { defaultValues, groupBySection, isModified, isShown, type ControlDefinition } from './controls';

const range: ControlDefinition = {
    section: 'A',
    key: 'amount',
    label: 'Amount',
    type: 'range',
    min: 0,
    max: 1,
    step: 0.1,
    default: 0.5,
};
const checkbox: ControlDefinition = { section: 'B', key: 'enabled', label: 'Enabled', type: 'checkbox', default: true };
const color: ControlDefinition = { section: 'A', key: 'tint', label: 'Tint', type: 'color', default: '#ff0000' };
const dependent: ControlDefinition = {
    section: 'B',
    key: 'extra',
    label: 'Extra',
    type: 'range',
    min: 0,
    max: 1,
    step: 1,
    default: 0,
    shownWhen: 'enabled',
};

describe('defaultValues', () => {
    it('maps every control key to its default, for each control type', () => {
        expect(defaultValues([range, checkbox, color])).toEqual({ amount: 0.5, enabled: true, tint: '#ff0000' });
    });

    it('returns an empty object for no controls', () => {
        expect(defaultValues([])).toEqual({});
    });
});

describe('isModified', () => {
    it('is false at the default and true away from it, for each control type', () => {
        expect(isModified(range, 0.5)).toBe(false);
        expect(isModified(range, 0.6)).toBe(true);
        expect(isModified(checkbox, true)).toBe(false);
        expect(isModified(checkbox, false)).toBe(true);
        expect(isModified(color, '#ff0000')).toBe(false);
        expect(isModified(color, '#00ff00')).toBe(true);
    });
});

describe('isShown', () => {
    it('always shows a control without a shownWhen key', () => {
        expect(isShown(range, {})).toBe(true);
    });

    it('follows the truthiness of the controlling value', () => {
        expect(isShown(dependent, { enabled: true })).toBe(true);
        expect(isShown(dependent, { enabled: false })).toBe(false);
        expect(isShown(dependent, { enabled: 0 })).toBe(false);
        expect(isShown(dependent, { enabled: 2 })).toBe(true);
    });

    it('hides the control when the controlling value is missing', () => {
        expect(isShown(dependent, {})).toBe(false);
    });
});

describe('groupBySection', () => {
    it('groups controls by section, keeping the order in which each section first appears', () => {
        const sections = groupBySection([range, checkbox, color, dependent]);
        expect(sections.map((section) => section.name)).toEqual(['A', 'B']);
        expect(sections[0].controls).toEqual([range, color]);
        expect(sections[1].controls).toEqual([checkbox, dependent]);
    });

    it('returns no sections for no controls', () => {
        expect(groupBySection([])).toEqual([]);
    });
});
