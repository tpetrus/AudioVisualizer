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

// True while a modal dialog is open in the event's document: F there belongs to the dialog, not to fullscreen.
function hasOpenModal(event: KeyboardEvent): boolean {
    const doc = event.target instanceof Node ? (event.target.ownerDocument ?? document) : document;
    return doc.querySelector('dialog[open], [aria-modal="true"]') !== null;
}

// True for a plain, first press of F that nothing else claimed and that is not typing.
export function shouldToggleOnKey(event: KeyboardEvent): boolean {
    // Browser autofill can dispatch keydown events without a key.
    if (typeof event.key !== 'string') return false;
    return (
        event.key.toLowerCase() === 'f' &&
        !event.isComposing &&
        !event.ctrlKey &&
        !event.metaKey &&
        !event.altKey &&
        !event.shiftKey &&
        !event.repeat &&
        !event.defaultPrevented &&
        !isTypingTarget(event.target) &&
        !hasOpenModal(event)
    );
}

// Escape ends pseudo-fullscreen; browsers handle it themselves in native fullscreen. An IME uses Escape to cancel a
// composition, which must not also leave fullscreen.
export function isEscapeKey(event: KeyboardEvent): boolean {
    return event.key === 'Escape' && !event.isComposing;
}
