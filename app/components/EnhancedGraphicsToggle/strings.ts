export const ENHANCED_GRAPHICS_STRINGS = {
    label: 'Enhanced graphics',
    on: 'On',
    off: 'Off',
    description:
        'Richer lighting, reflections and sky for the dancing character. Needs a strong GPU; downloads up to about 30 MB.',
    capabilityHint: 'Your device can likely handle this',
    status: {
        loading: 'Loading enhanced assets',
        ready: 'Enhanced graphics on',
        error: 'Could not load enhanced assets, using standard',
    },
} as const;
