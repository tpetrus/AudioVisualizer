import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import { type ControlDefinition, type ControlValue, defaultValues } from './controls';
import { useLatestRef } from '~/hooks/useLatestRef';

// Holds a visualizer's control values. `definitions` must be a module-level constant.
export function useControlValues<T extends readonly ControlDefinition[]>(definitions: T) {
    const [values, setValues] = useState(() => defaultValues(definitions));

    // The render loop is created once, so it reads the latest values through this ref instead of `values`.
    const valuesRef = useLatestRef(values);

    // The panel only reports keys taken from `definitions`, so the key/value pair always matches.
    const setValue = useCallback((key: string, value: ControlValue) => {
        setValues(current => ({ ...current, [key]: value }));
    }, []);

    const resetAll = useCallback(() => setValues(defaultValues(definitions)), [definitions]);

    return { values, valuesRef, setValue, resetAll };
}