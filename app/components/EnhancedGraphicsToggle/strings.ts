export const ENHANCED_GRAPHICS_STRINGS = {
    label: 'Enhanced graphics',
    on: 'On',
    off: 'Off',
    description:
        'Richer lighting, glow and depth for the dancing character and the trio color wave. Needs a strong GPU; the dancer downloads up to about 30 MB.',
    capabilityHint: 'Your device can likely handle this',
    status: {
        loading: 'Loading enhanced assets',
        ready: 'Enhanced graphics on',
        error: 'Could not load enhanced assets, using standard',
    },
} as const;
