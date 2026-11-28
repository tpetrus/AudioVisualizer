import { Range, Select } from '~/components/ui';
import styles from './ControlPanel.module.css';
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
                <Range
                    className={styles.input}
                    id={definition.key}
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
                    className="accent-accent"
                    id={definition.key}
                    checked={Boolean(value)}
                    onChange={(event) => onChange(event.currentTarget.checked)}
                />
            );
        case 'color':
            return (
                <input
                    type="color"
                    className={styles.colorInput}
                    id={definition.key}
                    value={String(value)}
                    onChange={(event) => onChange(event.currentTarget.value)}
                />
            );
        case 'select':
            return (
                <Select
                    className={styles.input}
                    id={definition.key}
                    value={String(value)}
                    onChange={(event) => onChange(event.currentTarget.value)}
                >
                    {definition.options.map((option) => (
                        <option key={option.value} value={option.value}>
                            {option.label}
                        </option>
                    ))}
                </Select>
            );
    }
}
