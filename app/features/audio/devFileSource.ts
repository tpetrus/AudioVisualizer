import type { AudioEngine } from './audioEngine';

// DEV only: plays a local audio file through the real audio chain so a visualizer can be watched and measured against
// a known track. Reached only through an `import.meta.env.DEV`-guarded dynamic import, so production never has it.

export interface FilePlayback {
    readonly label: string;
    readonly duration: number; // seconds
    readonly ended: boolean;
    position(): number; // seconds into the buffer, clamped to [0, duration]
    seek(seconds: number): void; // restarts playback at `seconds` (clamped)
}

let active: FilePlayback | undefined;

export function getActivePlayback(): FilePlayback | undefined {
    return active;
}

export async function startFileSource(
    engine: AudioEngine,
    data: ArrayBuffer,
    options: { label?: string; audible?: boolean; offset?: number } = {},
): Promise<FilePlayback> {
    const { label = 'audio file', audible = true, offset = 0 } = options;
    let playback!: FilePlayback;

    await engine.startSource(async (context) => {
        let buffer: AudioBuffer;
        try {
            buffer = await context.decodeAudioData(data);
        } catch {
            throw new Error(`Couldn't play ${label}: unsupported or corrupt audio file.`);
        }
        const { duration } = buffer;
        const clamp = (seconds: number) => Math.min(Math.max(seconds, 0), duration);

        // The bus is the graph's source node; buffer nodes come and go behind it.
        const bus = context.createGain();
        if (audible) {
            // Before the engine's gain stage, so the user hears the track at its own level.
            bus.connect(context.destination);
        }

        let node: AudioBufferSourceNode | undefined;
        let startedAt = 0;
        let from = 0;
        let ended = false;
        let stopped = false;

        const release = () => {
            if (node) {
                // A stopped node still fires `onended`; that must not read as the track finishing.
                node.onended = null;
                node.stop();
                node.disconnect();
                node = undefined;
            }
        };
        const play = (seconds: number) => {
            release();
            from = clamp(seconds);
            startedAt = context.currentTime;
            ended = false;
            const next = context.createBufferSource();
            next.buffer = buffer;
            next.connect(bus);
            next.onended = () => {
                ended = true;
                if (active === playback) {
                    engine.stopCapture();
                }
            };
            next.start(0, from);
            node = next;
        };

        const own: FilePlayback = {
            label,
            duration,
            get ended() {
                return ended;
            },
            position: () => (ended ? duration : clamp(from + context.currentTime - startedAt)),
            seek: (seconds) => {
                if (!stopped) {
                    play(seconds);
                }
            },
        };
        playback = own;
        play(offset);
        active = own;

        return {
            node: bus,
            label,
            stop: () => {
                stopped = true;
                release();
                bus.disconnect();
                if (active === own) {
                    active = undefined;
                }
            },
        };
    });
    return playback;
}
