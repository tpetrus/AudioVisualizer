import { ENHANCED_GRAPHICS_KEY } from './enhancedGraphicsStore';

export const ENHANCED_GRAPHICS_PROMPT_SEEN_KEY = 'audioVisualizer.enhancedGraphicsPromptSeen';

const PROBE_KEY = 'audioVisualizer.enhancedGraphicsPromptProbe';

// The prompt is a one-time courtesy, so every doubt reads as "do not show it": a stored flag, any stored preference
// (even 'false' means a returning user who already chose), and storage that cannot be written, because then the
// answer could not be remembered and the prompt would come back on every visit.
export function shouldShowEnhancedGraphicsPrompt(): boolean {
    try {
        if (localStorage.getItem(ENHANCED_GRAPHICS_PROMPT_SEEN_KEY) !== null) {
            return false;
        }
        if (localStorage.getItem(ENHANCED_GRAPHICS_KEY) !== null) {
            return false;
        }
        localStorage.setItem(PROBE_KEY, '1');
        localStorage.removeItem(PROBE_KEY);
        return true;
    } catch {
        return false;
    }
}

export function markEnhancedGraphicsPromptSeen(): void {
    try {
        localStorage.setItem(ENHANCED_GRAPHICS_PROMPT_SEEN_KEY, '1');
    } catch {
        // Nothing to do: the prompt is then simply not shown again this session, and storage that cannot be written
        // never shows it at all (see shouldShowEnhancedGraphicsPrompt).
    }
}
