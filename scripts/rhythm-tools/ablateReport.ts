// What one ablation run measured, and how it prints. No app imports, so the esbuild plugin's bundle and the printing side
// share only this shape.

export interface AblationSample {
    time: number;
    held: number;
    raw: number;
}

export interface AblationResult {
    sampleRate: number;
    frameRate: number;
    // Seconds of audio that were analyzed.
    seconds: number;
    // The first moment the tracker held a tempo, or undefined if it never did.
    firstLock: { time: number; held: number; raw: number } | undefined;
    // The held and raw tempo every `every` seconds.
    samples: AblationSample[];
    // Times at which the beat grid was rebuilt (the grid epoch rose) and at which a song change was counted.
    gridRebuilds: number[];
    songChanges: number[];
}

function seconds(value: number): string {
    return value.toFixed(2);
}

function times(list: readonly number[]): string {
    return list.length === 0 ? '0' : `${list.length} at t = ${list.map(seconds).join(', ')} s`;
}

// Plain text with fixed precision and no timestamps or paths, so two runs of the same input print the same bytes.
export function formatAblation(
    name: string,
    overrides: readonly { name: string; value: string }[],
    result: AblationResult,
): string[] {
    const lines = [
        `Ablation of ${name}`,
        `Overrides: ${overrides.length === 0 ? 'none' : overrides.map((o) => `${o.name}=${o.value}`).join(', ')}`,
        `${result.sampleRate} Hz audio, ${seconds(result.frameRate)} frames/s, ${seconds(result.seconds)} s analyzed`,
        '',
        result.firstLock
            ? `First lock: t = ${seconds(result.firstLock.time)} s at ${seconds(result.firstLock.held)} BPM ` +
              `(raw ${seconds(result.firstLock.raw)})`
            : 'First lock: never',
        '',
        'Held tempo over time',
        '   t (s)    held BPM    raw BPM',
    ];
    for (const sample of result.samples) {
        lines.push(
            `${seconds(sample.time).padStart(8)}${seconds(sample.held).padStart(12)}${seconds(sample.raw).padStart(11)}`,
        );
    }
    lines.push('', `Grid rebuilds: ${times(result.gridRebuilds)}`, `Song changes: ${times(result.songChanges)}`);
    return lines;
}
