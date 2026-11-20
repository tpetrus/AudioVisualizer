import { readdirSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';

// Every symbolic link or junction under `root` (root itself excluded), found without following any of them. On Windows
// `git worktree remove` deletes through a junction: a worktree whose node_modules and .debug-in were junctions to the
// main checkout emptied both there (2026-11-20). Removing a worktree is safe only once this is empty.
export function findLinks(root: string): string[] {
    const links: string[] = [];
    const walk = (dir: string): void => {
        for (const entry of readdirSync(dir, { withFileTypes: true })) {
            const path = join(dir, entry.name);
            if (entry.isSymbolicLink()) links.push(path);
            else if (entry.isDirectory()) walk(path);
        }
    };
    walk(root);
    return links.sort();
}

// Removes the links themselves, never what they point at: unlink deletes a symbolic link or a Windows junction as an
// entry of its own (checked on Windows: the junction goes and its target's files stay), where a recursive delete would
// follow it.
export function removeLinks(links: readonly string[]): void {
    for (const link of links) unlinkSync(link);
}

export interface RemoveArgs {
    path: string | undefined;
    unlink: boolean;
    help: boolean;
}

export function parseRemoveArgs(argv: readonly string[]): RemoveArgs {
    const args: RemoveArgs = { path: undefined, unlink: false, help: false };
    for (const arg of argv) {
        if (arg === '--help' || arg === '-h') args.help = true;
        else if (arg === '--unlink') args.unlink = true;
        else if (arg.startsWith('--')) throw new Error(`Unknown option ${arg}`);
        else if (args.path === undefined) args.path = arg;
        else throw new Error(`Only one worktree path, got ${args.path} and ${arg}`);
    }
    return args;
}
