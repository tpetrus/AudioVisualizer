import { describe, expect, it } from 'vitest';
import { causeNote, cleanLine, createLineCollector } from './output';

describe('createLineCollector', () => {
    it('splits lines across chunk boundaries', () => {
        const c = createLineCollector();
        c.push('abc');
        c.push('def\nghi\n');
        expect(c.lines()).toEqual(['abcdef', 'ghi']);
    });

    it('treats a \\r\\n split across chunks as one break', () => {
        const c = createLineCollector();
        c.push('abc\r');
        c.push('\ndef\n');
        expect(c.lines()).toEqual(['abc', 'def']);
    });

    it('treats a bare \\r as a line break', () => {
        const c = createLineCollector();
        c.push('10%\r20%\r');
        c.push('30%\n');
        expect(c.lines()).toEqual(['10%', '20%', '30%']);
    });

    it('keeps genuinely empty lines', () => {
        const c = createLineCollector();
        c.push('a\n\nb\r\rc\n');
        expect(c.lines()).toEqual(['a', '', 'b', '', 'c']);
    });

    it('flushes a trailing partial line on end, once', () => {
        const c = createLineCollector();
        c.push('done\npartial');
        expect(c.lines()).toEqual(['done']);
        c.end();
        c.end();
        expect(c.lines()).toEqual(['done', 'partial']);
    });

    it('adds nothing on end when no partial is pending', () => {
        const c = createLineCollector();
        c.push('a\n');
        c.end();
        expect(c.lines()).toEqual(['a']);
    });

    it('keeps only the last maxLines lines', () => {
        const c = createLineCollector(3);
        c.push('1\n2\n3\n4\n5\n');
        expect(c.lines()).toEqual(['3', '4', '5']);
        c.push('6\n');
        expect(c.lines()).toEqual(['4', '5', '6']);
    });

    it('defaults to 20 lines', () => {
        const c = createLineCollector();
        c.push(Array.from({ length: 30 }, (_, i) => `l${i}`).join('\n') + '\n');
        expect(c.lines()).toHaveLength(20);
        expect(c.lines()[0]).toBe('l10');
    });

    it('bounds the partial line to its last maxPartial characters', () => {
        const c = createLineCollector(20, 5);
        c.push('0123456789');
        c.push('ab');
        c.end();
        expect(c.lines()).toEqual(['789ab']);
    });

    it('keeps channels apart, including a trailing \r', () => {
        const c = createLineCollector();
        c.push('out-', 0);
        c.push('err\n', 1);
        c.push('put\n', 0);
        expect(c.lines()).toEqual(['err', 'out-put']);
        c.push('x\r', 0);
        c.push('\ny\n', 1);
        expect(c.lines().slice(-3)).toEqual(['x', '', 'y']);
    });

    it('returns a copy of the lines', () => {
        const c = createLineCollector();
        c.push('a\n');
        c.lines().push('b');
        expect(c.lines()).toEqual(['a']);
    });
});

describe('cleanLine', () => {
    it('strips CSI sequences and trims', () => {
        expect(cleanLine('\u001b[31mred\u001b[0m  ')).toBe('red');
        expect(cleanLine('\u001b[2K\u001b[1Gready')).toBe('ready');
        expect(cleanLine('\u001b[?25lhidden\u001b[?25h')).toBe('hidden');
    });

    it('strips OSC sequences ended by BEL or ESC backslash', () => {
        expect(cleanLine('\u001b]8;;http://x.dev\u0007link\u001b]8;;\u0007')).toBe('link');
        expect(cleanLine('\u001b]8;;http://x.dev\u001b\\link\u001b]8;;\u001b\\')).toBe('link');
    });

    it('drops a stray lone ESC', () => {
        expect(cleanLine('a\u001bb')).toBe('ab');
        expect(cleanLine('end\u001b')).toBe('end');
    });

    it('leaves plain text alone', () => {
        expect(cleanLine('  Error: boom ')).toBe('Error: boom');
    });
});

describe('causeNote', () => {
    it('prefers the last error line over a later footer', () => {
        const lines = ['starting', 'Error: first', 'TypeError: second', '    at x', 'Node.js v24.0.0'];
        expect(causeNote(lines)).toBe(' Last output: TypeError: second');
    });

    it('falls back to the last non-empty line', () => {
        expect(causeNote(['one', 'port 5173 in use', '', '  '])).toBe(' Last output: port 5173 in use');
    });

    it('returns an empty string without usable output', () => {
        expect(causeNote([])).toBe('');
        expect(causeNote(['', '  ', '\u001b[0m'])).toBe('');
    });

    it('cleans escape sequences before matching', () => {
        expect(causeNote(['\u001b[31mERROR\u001b[0m bad'])).toBe(' Last output: ERROR bad');
    });

    it('truncates to maxLength, 200 by default', () => {
        expect(causeNote(['x'.repeat(300)])).toBe(` Last output: ${'x'.repeat(200)}`);
        expect(causeNote(['abcdef'], 3)).toBe(' Last output: abc');
    });
});
