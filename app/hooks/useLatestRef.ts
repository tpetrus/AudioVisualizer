import { useLayoutEffect, useRef } from 'react';

// A ref that always holds the latest value, for code that was created once (like a render loop) and must read
// a value that changes later without being recreated.
export function useLatestRef<T>(value: T): { readonly current: T } {
    const ref = useRef(value);
    useLayoutEffect(() => {
        ref.current = value;
    });
    return ref;
}
