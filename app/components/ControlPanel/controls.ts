interface ControlBase {
    key: string;
    label: string;
    section: string;
}

export interface RangeControl extends ControlBase {
    type: 'range';
    min: number;
    max: number;
    step: number;
    default: number;
}

export interface CheckboxControl extends ControlBase {
    type: 'checkbox';
    default: boolean;
}

export interface ColorControl extends ControlBase {
    type: 'color';
    default: string; // hex value
}

export type ControlDefinition = RangeControl | CheckboxControl | ColorControl;
export type ControlValue = ControlDefinition['default'];

type ValueOf<C extends ControlDefinition> =
    C extends RangeControl ? number : C extends CheckboxControl ? boolean : string;

export type ControlValues<T extends readonly ControlDefinition[]> = {
    [C in T[number]as C['key']]: ValueOf<C>;
};

export interface ControlSection {
    name: string;
    controls: ControlDefinition[];
}

export function defaultValues<T extends readonly ControlDefinition[]>(definitions: T): ControlValues<T> {
    return Object.fromEntries(definitions.map(definition => [definition.key, definition.default])) as ControlValues<T>;
}

export function isModified(definition: ControlDefinition, value: ControlValue): boolean {
    return value !== definition.default;
}

// Groups controls by section, keeping the order in which each section first appears.
export function groupBySection(definitions: readonly ControlDefinition[]): ControlSection[] {
    const sections = new Map<string, ControlDefinition[]>();
    for (const definition of definitions) {
        const controls = sections.get(definition.section) ?? [];
        controls.push(definition);
        sections.set(definition.section, controls);
    }
    return [...sections].map(([name, controls]) => ({ name, controls }));
}