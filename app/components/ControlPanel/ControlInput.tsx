import type { ControlDefinition, ControlValue } from './controls';

interface ControlInputProps {
    definition: ControlDefinition;
    value: ControlValue;
    onChange: (value: ControlValue) => void;
}

export function ControlInput({ definition, value, onChange }: ControlInputProps) {
    switch (definition.type) {
        case 'range':
            return (
                <input
                    type="range"
                    min={definition.min}
                    max={definition.max}
                    step={definition.step}
                    value={Number(value)}
                    onChange={(event) => onChange(Number(event.currentTarget.value))}
                />
            );
        case 'checkbox':
            return (
                <input
                    type="checkbox"
                    id={definition.key}
                    checked={Boolean(value)}
                    onChange={(event) => onChange(event.currentTarget.checked)}
                />
            );
        case 'color':
            return (
                <input
                    type="color"
                    id={definition.key}
                    value={String(value)}
                    onChange={(event) => onChange(event.currentTarget.value)}
                />
            );
    }
}
