// `npm run worktree:remove -- <path> [--unlink]`: removes a git worktree only once nothing inside it is a symbolic link
// or junction, because on Windows `git worktree remove` deletes through a junction into whatever it points at (a
// worktree whose node_modules and .debug-in were junctions to the main checkout emptied both there). Not part of the app
// bundle: nothing under app/ imports this file.

import { execFileSync } from 'node:child_process';
import { readlinkSync } from 'node:fs';
import { resolve } from 'node:path';
import { findLinks, parseRemoveArgs, removeLinks } from './worktree/links';

const USAGE = `Usage: npm run worktree:remove -- <worktree path> [--unlink]

Removes the git worktree at <path> with git worktree remove, but first looks for symbolic links and junctions inside it
(without following them). If there are any it lists them and stops; with --unlink it removes the links themselves (never
what they point at), checks again that none are left, and then removes the worktree. The main checkout and paths git
does not list as a worktree are refused.`;

const normalize = (path: string): string => resolve(path).replace(/\\/g, '/').toLowerCase();

// The worktrees git knows, main checkout first.
function listWorktrees(): string[] {
    const porcelain = execFileSync('git', ['worktree', 'list', '--porcelain'], { encoding: 'utf8' });
    return porcelain
        .split('\n')
        .filter((line) => line.startsWith('worktree '))
        .map((line) => normalize(line.slice('worktree '.length).trim()));
}

function main(): void {
    const args = parseRemoveArgs(process.argv.slice(2));
    if (args.help || args.path === undefined) {
        console.log(USAGE);
        return;
    }
    const path = resolve(args.path);
    const worktrees = listWorktrees();
    const index = worktrees.indexOf(normalize(path));
    if (index < 0) throw new Error(`${path} is not a worktree of this repository (see git worktree list)`);
    if (index === 0) throw new Error(`${path} is the main checkout; it is never removed this way`);

    let links = findLinks(path);
    if (links.length > 0 && !args.unlink) {
        console.error(`Not removed: ${path} contains links that git worktree remove would delete through:`);
        for (const link of links) console.error(`  ${link} -> ${readlinkSync(link)}`);
        console.error('Rerun with --unlink to remove the links first (their targets are kept).');
        process.exit(1);
    }
    if (links.length > 0) {
        removeLinks(links);
        console.log(`Removed ${links.length} link(s); their targets are untouched.`);
        links = findLinks(path);
        if (links.length > 0) throw new Error(`Links are still there, not removing: ${links.join(', ')}`);
    }
    execFileSync('git', ['worktree', 'remove', path], { stdio: 'inherit' });
    console.log(`Removed worktree ${path}`);
}

try {
    main();
} catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
}
