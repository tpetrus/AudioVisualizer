// `npm run scorecard:order -- --pair A,B`: AC11. Records (or ingests) page sessions in which two hub-fed visualizers play
// the same track one after the other without a reload, in both orders and each after itself as a control, and writes a
// report comparing each visualizer's second play after the other with its second play after itself. A report, not a gate: it exits 0 whatever the rows say.
// Not part of the app bundle: nothing under app/ imports this file.

import { execSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { LIVE_FILE } from './live/args';
import { describeRunFolder, discoverRunFolders, loadRun, type RunFolder } from './live/ingest';
import { TARGETS_VERSION } from './targets';
import { orderRows, type LiveCellLookup, type LoadedSession, type OrderRun } from './order/compare';
import { ORDER_USAGE, parseOrderArgs, type OrderArgs } from './order/args';
import { recordSession } from './order/record';
import { renderMarkdown, summaryLine, type OrderReport } from './order/report';
import {
    missingPlans,
    pairSessions,
    planSessions,
    selectSessions,
    sessionsWithSettle,
    type OrderSession,
} from './order/sessions';
import { folderSettle } from './order/settle';

const DEBUG_OUT = '.debug-out';

function revision(): string {
    try {
        return execSync('git rev-parse --short HEAD', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    } catch {
        return 'unknown';
    }
}

interface LiveFileShape {
    header?: { revision?: string };
    cells?: {
        metric: string;
        track: string;
        visualizer: string;
        value: number | null;
        spread: number;
        status: string;
        applicable: boolean;
    }[];
}

function readLive(): LiveFileShape | undefined {
    const path = resolve(LIVE_FILE);
    if (!existsSync(path)) return undefined;
    try {
        return JSON.parse(readFileSync(path, 'utf8')) as LiveFileShape;
    } catch {
        return undefined;
    }
}

function describeAll(paths: readonly string[]): RunFolder[] {
    const folders: RunFolder[] = [];
    for (const path of paths) {
        const found = discoverRunFolders(resolve(path));
        if (found.length === 0) console.log(`${path}: no run folders found`);
        for (const folderPath of found) {
            const folder = describeRunFolder(folderPath);
            if (folder) folders.push(folder);
        }
    }
    return folders;
}

// Recording is real time and CPU sensitive, so the sessions run strictly one after another.
async function record(args: OrderArgs, existing: readonly OrderSession[]): Promise<RunFolder[]> {
    const pair = args.pair!;
    const dir = resolve(args.dir);
    const outputs: string[] = [];
    const planned = planSessions(pair, args.tracks, args.sessions);
    for (const plan of args.topUp ? missingPlans(planned, existing) : planned) {
        if (!existsSync(resolve(dir, plan.track))) {
            console.log(`${plan.track}: not in ${dir}; skipped`);
            continue;
        }
        const started = Date.now();
        const result = await recordSession({
            dir,
            ...plan,
            seconds: args.seconds,
            settle: args.settle,
            headless: args.headless,
        });
        const seconds = ((Date.now() - started) / 1000).toFixed(1);
        if (result.code !== 0 || result.folders.length < 2) {
            console.log(`${plan.track} ${plan.lead} then ${plan.then}: failed after ${seconds} s (${result.tail})`);
            continue;
        }
        console.log(`${plan.track} ${plan.lead} then ${plan.then}: recorded in ${seconds} s`);
        outputs.push(...result.folders);
    }
    return outputs.flatMap((path) => {
        const folder = describeRunFolder(path);
        return folder ? [folder] : [];
    });
}

function load(folder: RunFolder, dir: string | undefined): OrderRun | undefined {
    try {
        const run = loadRun(folder, dir);
        return { table: run.table, beats: run.sidecar?.beats };
    } catch (error) {
        console.log(`${folder.path} could not be read (${(error as Error).message}); run left out`);
        return undefined;
    }
}

async function main(): Promise<void> {
    const args = parseOrderArgs(process.argv.slice(2));
    if (args.help) {
        console.log(ORDER_USAGE);
        return;
    }
    const pair = args.pair!;
    let folders: RunFolder[];
    if (args.topUp) {
        // Count what .debug-out already holds, record the shortfall, then read .debug-out again for the report.
        await record(args, sessionsWithSettle(pairSessions(describeAll([DEBUG_OUT]), pair), args.settle, folderSettle));
        folders = describeAll([DEBUG_OUT]);
    } else folders = args.ingest.length > 0 ? describeAll(args.ingest) : await record(args, []);
    const dir = existsSync(resolve(args.dir)) ? resolve(args.dir) : undefined;

    const selected = selectSessions(
        sessionsWithSettle(pairSessions(folders, pair), args.settle, folderSettle),
        pair,
        args.tracks,
        args.sessions,
    );
    const sessionsByTrack = new Map<string, LoadedSession[]>();
    for (const [track, sessions] of selected) {
        const loaded: LoadedSession[] = [];
        for (const session of sessions) {
            const lead = load(session.lead, dir);
            const follow = load(session.follow, dir);
            if (lead && follow) {
                loaded.push({ leadViz: session.lead.viz, followViz: session.follow.viz, lead, follow });
            }
        }
        console.log(`${track}: ${loaded.length} session(s)`);
        sessionsByTrack.set(track, loaded);
    }

    const live = readLive();
    const cells = new Map((live?.cells ?? []).map((cell) => [`${cell.metric}|${cell.track}|${cell.visualizer}`, cell]));
    const cellOf: LiveCellLookup = (metric, track, visualizer) => cells.get(`${metric}|${track}|${visualizer}`);

    const report: OrderReport = {
        header: {
            targetsVersion: TARGETS_VERSION,
            revision: revision(),
            created: new Date().toISOString(),
            settle: args.settle,
            liveRevision: live?.header?.revision ?? null,
        },
        rows: orderRows(pair, sessionsByTrack, cellOf),
    };
    const out = resolve(args.out);
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(`${out}.json`, `${JSON.stringify(report, null, 2)}\n`);
    writeFileSync(`${out}.md`, renderMarkdown(report));
    console.log(summaryLine(report.rows));
    console.log(`Wrote ${args.out}.json and ${args.out}.md`);
}

main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
});
