import { useSyncExternalStore } from 'react';
import { getEnhancedGraphics, subscribeEnhancedGraphics } from './enhancedGraphicsStore';

// The server snapshot is false so a prerender or hydration never starts with the heavy look.
export function useEnhancedGraphics(): boolean {
    return useSyncExternalStore(subscribeEnhancedGraphics, getEnhancedGraphics, () => false);
}
