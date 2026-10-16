import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, vi } from 'vitest';

// Runs after every test in every spec (vitest `setupFiles`). Keeps specs independent of each other without each one
// remembering to clean up after itself.
afterEach(() => {
    // Unmounts anything rendered with Testing Library. Harmless in node-environment specs, where nothing is mounted.
    cleanup();
    // The fakes install themselves with `vi.stubGlobal` / `vi.stubEnv`; undo them so they never leak between tests.
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
});
