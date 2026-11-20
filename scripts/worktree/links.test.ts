import { existsSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { findLinks, parseRemoveArgs, removeLinks } from './links';

describe('findLinks and removeLinks', () => {
    let root: string;
    let target: string;
    let worktree: string;

    beforeEach(() => {
        root = mkdtempSync(join(tmpdir(), 'worktree-links-'));
        target = join(root, 'shared');
        worktree = join(root, 'worktree');
        mkdirSync(join(target, 'inner'), { recursive: true });
        writeFileSync(join(target, 'inner', 'precious.txt'), 'keep');
        mkdirSync(join(worktree, 'scripts', 'deep'), { recursive: true });
        writeFileSync(join(worktree, 'scripts', 'file.ts'), '');
    });

    afterEach(() => {
        // The links are gone or point at `target`, which is inside `root`, so this deletes only what the spec made.
        rmSync(root, { recursive: true, force: true });
    });

    // 'junction' makes a junction on Windows and is ignored elsewhere, where it makes a directory symlink.
    const link = (path: string) => symlinkSync(target, path, 'junction');

    it('finds links at any depth without following them', () => {
        link(join(worktree, 'node_modules'));
        link(join(worktree, 'scripts', 'deep', 'data'));
        expect(findLinks(worktree)).toEqual(
            [join(worktree, 'node_modules'), join(worktree, 'scripts', 'deep', 'data')].sort(),
        );
    });

    it('finds nothing in a worktree without links', () => {
        expect(findLinks(worktree)).toEqual([]);
    });

    it('removes the links and leaves what they point at', () => {
        link(join(worktree, 'node_modules'));
        removeLinks(findLinks(worktree));
        expect(findLinks(worktree)).toEqual([]);
        expect(existsSync(join(worktree, 'node_modules'))).toBe(false);
        expect(existsSync(join(target, 'inner', 'precious.txt'))).toBe(true);
    });
});

describe('parseRemoveArgs', () => {
    it('reads the path and the options', () => {
        expect(parseRemoveArgs(['../wt/a', '--unlink'])).toEqual({ path: '../wt/a', unlink: true, help: false });
        expect(parseRemoveArgs(['--help'])).toMatchObject({ help: true, path: undefined });
    });

    it.each([
        [['--force'], /Unknown option --force/],
        [['a', 'b'], /Only one worktree path/],
    ])('rejects %j', (argv, message) => {
        expect(() => parseRemoveArgs(argv)).toThrow(message);
    });
});
