// Pure helpers for the dev server's console output, kept apart from run.ts so they can be tested without a process.

// Escape sequences (colors, cursor moves, line erases, hyperlinks) from the dev server's output would garble the error
// line. OSC runs first so a hyperlink's URL is removed whole instead of leaving its text behind.
/* eslint-disable no-control-regex */
const OSC = /\u001b\][^\u0007\u001b]*(?:\u0007|\u001b\\)/g;
const CSI = /\u001b\[[0-9;?]*[ -/]*[@-~]/g;
const LONE_ESC = /\u001b/g;
/* eslint-enable no-control-regex */

export function cleanLine(line: string): string {
    return line.replace(OSC, '').replace(CSI, '').replace(LONE_ESC, '').trim();
}

interface Channel {
    partial: string;
    // The last chunk ended with \r, so a \n opening the next one is the second half of a \r\n, not a new line.
    afterCr: boolean;
}

export interface LineCollector {
    // `channel` separates streams (stdout, stderr) so one stream's half line is never glued to the other's.
    push(chunk: string, channel?: number): void;
    end(channel?: number): void;
    lines(): string[];
}

// Keeps the last few lines of output. The ring and the partial line are bounded so a chatty or newline-free server
// cannot grow memory.
export function createLineCollector(maxLines = 20, maxPartial = 500): LineCollector {
    const ring: string[] = [];
    const channels = new Map<number, Channel>();

    function channelFor(id: number): Channel {
        let channel = channels.get(id);
        if (!channel) {
            channel = { partial: '', afterCr: false };
            channels.set(id, channel);
        }
        return channel;
    }

    function add(parts: string[]): void {
        ring.push(...parts);
        if (ring.length > maxLines) ring.splice(0, ring.length - maxLines);
    }

    return {
        push(chunk, id = 0) {
            const channel = channelFor(id);
            const text = channel.afterCr && chunk.startsWith('\n') ? chunk.slice(1) : chunk;
            if (chunk) channel.afterCr = chunk.endsWith('\r');
            // A bare \r is a line break too: progress output redraws a line with it.
            const parts = (channel.partial + text).split(/\r\n|\r|\n/);
            channel.partial = (parts.pop() ?? '').slice(-maxPartial);
            add(parts);
        },
        end(id = 0) {
            const channel = channelFor(id);
            if (channel.partial) add([channel.partial]);
            channel.partial = '';
        },
        lines: () => [...ring],
    };
}

// The one-line error carries the cause: the last line that names an error (a crashing node process ends with a
// "Node.js vX" footer below it), else the last non-empty line (a port clash, a syntax error).
export function causeNote(lines: string[], maxLength = 200): string {
    const clean = lines.map(cleanLine).filter(Boolean);
    const cause = [...clean].reverse().find((line) => /error/i.test(line)) ?? clean.at(-1);
    return cause ? ` Last output: ${cause.slice(0, maxLength)}` : '';
}
