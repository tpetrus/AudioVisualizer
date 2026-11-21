// Every piece of text the fullscreen feature shows or announces, in one place so the button, the hint toast and the
// touch exit button stay consistent (and can be localized together later).
export const FULLSCREEN_STRINGS = {
    // The fullscreen button's accessible name and tooltip; the shortcut is named the way YouTube names it.
    enter: 'Fullscreen (F)',
    exit: 'Exit fullscreen (F)',
    // The hint toast shown for 3 s each time fullscreen starts. Touch devices have no Escape key.
    keyboardHint: 'Press ESC to exit Fullscreen mode',
    touchHint: 'Tap the screen, then the exit icon to leave fullscreen',
    // The tap-revealed button on touch devices.
    exitButton: 'Exit fullscreen',
} as const;
