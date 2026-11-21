// Input types that take typed text; pressing F there must type an "f", not toggle fullscreen. Sliders, checkboxes,
// radios and buttons are deliberately absent: the shortcut should keep working after the user adjusts a control.
const TEXT_INPUT_TYPES = new Set(['text', 'search', 'number', 'email', 'url', 'password', 'tel']);

// True when keystrokes aimed at `target` are text entry. contenteditable is found with closest() because jsdom does
// not implement isContentEditable, and a child block inside an editable region is editable too.
export function isTypingTarget(target: EventTarget | null): boolean {
    if (!(target instanceof Element)) return false;
    const tag = target.tagName;
    if (tag === 'TEXTAREA' || tag === 'SELECT') return true;
    if (tag === 'INPUT') {
        // A missing or empty type attribute means a text field.
        const type = (target.getAttribute('type') ?? '').toLowerCase() || 'text';
        return TEXT_INPUT_TYPES.has(type);
    }
    return target.closest('[contenteditable]:not([contenteditable="false"])') !== null;
}

// True for a plain, first press of F that nothing else claimed and that is not typing.
export function shouldToggleOnKey(event: KeyboardEvent): boolean {
    return (
        event.key.toLowerCase() === 'f' &&
        !event.isComposing &&
        !event.ctrlKey &&
        !event.metaKey &&
        !event.altKey &&
        !event.shiftKey &&
        !event.repeat &&
        !event.defaultPrevented &&
        !isTypingTarget(event.target)
    );
}

// Escape ends pseudo-fullscreen; browsers handle it themselves in native fullscreen. An IME uses Escape to cancel a
// composition, which must not also leave fullscreen.
export function isEscapeKey(event: KeyboardEvent): boolean {
    return event.key === 'Escape' && !event.isComposing;
}
