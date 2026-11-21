// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { isEscapeKey, isTypingTarget, shouldToggleOnKey } from './fullscreenKeys';

function input(type?: string): HTMLInputElement {
    const el = document.createElement('input');
    if (type !== undefined) el.setAttribute('type', type);
    return el;
}

// Dispatches a real keydown so `event.target` is set the way the browser sets it.
function press(init: KeyboardEventInit, target: Element = document.body): KeyboardEvent {
    let captured!: KeyboardEvent;
    const listener = (event: Event) => void (captured = event as KeyboardEvent);
    if (target !== document.body) document.body.append(target);
    target.addEventListener('keydown', listener);
    target.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init }));
    target.removeEventListener('keydown', listener);
    if (target !== document.body) target.remove();
    return captured;
}

describe('isTypingTarget', () => {
    it.each(['text', 'search', 'number', 'email', 'url', 'password', 'tel', 'TEXT', ''])(
        'is true for an input of type "%s"',
        (type) => expect(isTypingTarget(input(type))).toBe(true),
    );

    it('is true for an input without a type', () => expect(isTypingTarget(input())).toBe(true));

    it('is true for a textarea and a select', () => {
        expect(isTypingTarget(document.createElement('textarea'))).toBe(true);
        expect(isTypingTarget(document.createElement('select'))).toBe(true);
    });

    it('is true inside a contenteditable region, including child blocks', () => {
        const editor = document.createElement('div');
        editor.setAttribute('contenteditable', 'true');
        const child = document.createElement('p');
        editor.append(child);
        expect(isTypingTarget(editor)).toBe(true);
        expect(isTypingTarget(child)).toBe(true);
        editor.setAttribute('contenteditable', '');
        expect(isTypingTarget(child)).toBe(true);
    });

    it.each(['range', 'checkbox', 'radio', 'button', 'submit', 'color'])('is false for an input of type %s', (type) =>
        expect(isTypingTarget(input(type))).toBe(false),
    );

    it('is false for buttons, plain elements, contenteditable=false, and non-elements', () => {
        expect(isTypingTarget(document.createElement('button'))).toBe(false);
        expect(isTypingTarget(document.createElement('div'))).toBe(false);
        const off = document.createElement('div');
        off.setAttribute('contenteditable', 'false');
        expect(isTypingTarget(off)).toBe(false);
        expect(isTypingTarget(null)).toBe(false);
        expect(isTypingTarget(window)).toBe(false);
    });
});

describe('shouldToggleOnKey', () => {
    it('accepts a plain f and an uppercase F', () => {
        expect(shouldToggleOnKey(press({ key: 'f' }))).toBe(true);
        expect(shouldToggleOnKey(press({ key: 'F' }))).toBe(true);
    });

    it('rejects other keys', () => {
        expect(shouldToggleOnKey(press({ key: 'g' }))).toBe(false);
        expect(shouldToggleOnKey(press({ key: 'Escape' }))).toBe(false);
    });

    it.each([{ ctrlKey: true }, { metaKey: true }, { altKey: true }, { shiftKey: true }])(
        'rejects with modifier %o',
        (modifier) => expect(shouldToggleOnKey(press({ key: 'f', ...modifier }))).toBe(false),
    );

    it('rejects repeats and compositions', () => {
        expect(shouldToggleOnKey(press({ key: 'f', repeat: true }))).toBe(false);
        expect(shouldToggleOnKey(press({ key: 'f', isComposing: true }))).toBe(false);
    });

    it('rejects an event someone already handled', () => {
        const event = new KeyboardEvent('keydown', { key: 'f', cancelable: true });
        event.preventDefault();
        expect(shouldToggleOnKey(event)).toBe(false);
    });

    it('rejects while typing but allows a range slider, checkbox and button', () => {
        expect(shouldToggleOnKey(press({ key: 'f' }, input('text')))).toBe(false);
        expect(shouldToggleOnKey(press({ key: 'f' }, input()))).toBe(false);
        expect(shouldToggleOnKey(press({ key: 'f' }, document.createElement('textarea')))).toBe(false);
        expect(shouldToggleOnKey(press({ key: 'f' }, input('range')))).toBe(true);
        expect(shouldToggleOnKey(press({ key: 'f' }, input('checkbox')))).toBe(true);
        expect(shouldToggleOnKey(press({ key: 'f' }, document.createElement('button')))).toBe(true);
    });
});

describe('shouldToggleOnKey guards', () => {
    it('ignores keydowns without a string key (autofill)', () => {
        const event = new KeyboardEvent('keydown', { key: 'f' });
        Object.defineProperty(event, 'key', { value: undefined });
        expect(shouldToggleOnKey(event)).toBe(false);
    });

    it('ignores the key while a modal dialog is open', () => {
        const dialog = document.createElement('div');
        dialog.setAttribute('aria-modal', 'true');
        document.body.append(dialog);
        expect(shouldToggleOnKey(press({ key: 'f' }))).toBe(false);
        dialog.remove();
        const native = document.createElement('dialog');
        native.setAttribute('open', '');
        document.body.append(native);
        expect(shouldToggleOnKey(press({ key: 'f' }))).toBe(false);
        native.remove();
        expect(shouldToggleOnKey(press({ key: 'f' }))).toBe(true);
    });

    it('falls back to document when the target is not a node', () => {
        expect(shouldToggleOnKey(new KeyboardEvent('keydown', { key: 'f' }))).toBe(true);
    });
});

describe('isEscapeKey', () => {
    it('accepts Escape only when not composing', () => {
        expect(isEscapeKey(new KeyboardEvent('keydown', { key: 'Escape' }))).toBe(true);
        expect(isEscapeKey(new KeyboardEvent('keydown', { key: 'Escape', isComposing: true }))).toBe(false);
        expect(isEscapeKey(new KeyboardEvent('keydown', { key: 'f' }))).toBe(false);
    });
});
