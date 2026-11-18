import { describe, expect, it } from 'vitest';
import { createPlaybackStart } from './playbackStart';

function feed(restartedFrom: number | undefined, positions: number[]): boolean[] {
    const start = createPlaybackStart(restartedFrom, 2);
    return positions.map((position) => start.observe(position));
}

describe('createPlaybackStart', () => {
    it('accepts the first play at any position', () => {
        expect(feed(undefined, [0, 5])).toEqual([true, true]);
    });

    it('accepts a drop from a previous position of 0 and never before', () => {
        expect(feed(0, [0.05, 0.15, 0.02])).toEqual([false, false, true]);
    });

    it('does not accept an old playback still rising above restartedFrom', () => {
        expect(feed(10, [10.1, 10.2, 10.3])).toEqual([false, false, false]);
    });

    it('accepts a position below 2 when restartedFrom is 30', () => {
        expect(feed(30, [30.1, 30.2, 1.5])).toEqual([false, false, true]);
    });

    it('accepts a lower position after an old playback held at its duration', () => {
        expect(feed(30, [30, 30, 30, 4])).toEqual([false, false, false, true]);
    });

    it('does not count the first poll as a drop', () => {
        expect(feed(30, [29])).toEqual([false]);
    });
});
