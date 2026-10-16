import type { AudioEngine } from '~/features/audio/audioEngine';
import { hopSizeFor } from './onsetExtractor';
import { RhythmAnalyzer } from './rhythmAnalyzer';
import { RHYTHM_PROCESSOR_NAME } from './rhythmConfig';
import workletUrl from './rhythmProcessor.worklet?worker&url';
import { type BeatsPerBar, type FrameBatch, type RhythmState, createRhythmState } from './types';

// Listens to the audio engine's analyser and keeps `state` describing the music's tempo, beat, meter and song
// changes. Framework-free like AudioEngine: React reaches it through `subscribe` and the arrow-property getters
// (see useRhythmState.ts), and render loops read `state` directly.
//
// Two kinds of values, because they change at different speeds:
//  - `state` is one preallocated object that is mutated in place, many times a second. Never put it in React state.
//  - the store (`subscribe`, `getBeatsPerBar`, `getSongChangeCount`) only notifies when the meter flips or a song
//    change is detected, which is rare enough for React to re-render on.
//
// Nothing here touches a browser API until `start()`, because index.html is prerendered at build time.
export class RhythmTracker {
    // Mutated in place for the tracker's whole life; render loops may hold on to it.
    readonly state: RhythmState = createRhythmState();

    private engine: AudioEngine | undefined;
    private unsubscribe: (() => void) | undefined;

    private boundAnalyser: AnalyserNode | undefined;
    private analyzer: RhythmAnalyzer | undefined;
    private node: AudioWorkletNode | undefined;
    // Raised on every bind and unbind. An async step that finds a different value than it started with has been
    // superseded (a quick source switch, or StrictMode's double mount) and must not attach anything.
    private generation = 0;
    // The worklet module is added once per AudioContext; later binds on the same context reuse the promise.
    private readonly loadedModules = new WeakMap<BaseAudioContext, Promise<void>>();

    // Values mirrored for the store, so a notification is sent only when one of them changes.
    private beatsPerBar: BeatsPerBar | undefined;
    private songChangeCount = 0;

    private readonly listeners = new Set<() => void>();
    readonly subscribe = (listener: () => void): (() => void) => {
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
    };

    // Snapshot getters for useSyncExternalStore: arrow properties, stable primitives.
    public getBeatsPerBar = (): BeatsPerBar | undefined => this.beatsPerBar;
    public getSongChangeCount = (): number => this.songChangeCount;

    // Starts following `engine`. Safe to call again (it restarts), and undone by `dispose()`.
    public start(engine: AudioEngine): void {
        this.dispose();
        this.engine = engine;
        this.unsubscribe = engine.subscribe(this.sync);
        this.sync();
    }

    // Stops analysing and frees the worklet node and the engine subscription. The last state stays readable.
    public dispose(): void {
        this.unsubscribe?.();
        this.unsubscribe = undefined;
        this.engine = undefined;
        this.unbind();
        this.boundAnalyser = undefined;
    }

    // Brings the phase fields, `nextBeatTime` and the beat counters in `state` up to `now` (AudioContext seconds;
    // defaults to the bound context's clock). Call it once per animation frame before reading them: it is cheap,
    // allocates nothing, and extrapolates from the newest beat so the phase is right even though analysis runs
    // ~100 ms behind the audio.
    public updatePhase(now?: number): void {
        const time = now ?? this.boundAnalyser?.context.currentTime;
        if (time !== undefined) {
            this.analyzer?.updatePhase(time);
        }
    }

    // Follows the engine's analyser. A different analyser is a new source, so the old analysis is thrown away; no
    // analyser means the music stopped, which stops the analysis but keeps the last state visible.
    private readonly sync = (): void => {
        const analyser = this.engine?.getAnalyser();
        if (analyser === this.boundAnalyser) {
            return;
        }
        this.unbind();
        this.boundAnalyser = analyser;
        if (analyser) {
            this.bind(analyser);
        }
    };

    private bind(analyser: AnalyserNode): void {
        const context = analyser.context;
        // Only a source that was actually analysed counts as a song change: the first bind, and StrictMode's
        // second bind of the same analyser, have heard nothing yet.
        const heardSomething = this.analyzer !== undefined && this.analyzer.framesProcessed > 0;
        const frameRate = context.sampleRate / hopSizeFor(context.sampleRate);
        this.analyzer = new RhythmAnalyzer(frameRate, this.state);
        if (heardSomething) {
            this.analyzer.hardReset(true);
        }
        this.publish();

        const generation = ++this.generation;
        this.loadModule(context)
            .then(() => {
                if (generation !== this.generation) {
                    return;
                }
                this.attachNode(analyser, generation);
            })
            .catch((error: unknown) => {
                if (generation === this.generation) {
                    console.error('RhythmTracker could not start the audio worklet', error);
                }
            });
    }

    private attachNode(analyser: AnalyserNode, generation: number): void {
        const node = new AudioWorkletNode(analyser.context, RHYTHM_PROCESSOR_NAME, {
            numberOfInputs: 1,
            numberOfOutputs: 0,
            channelCount: 2,
            channelCountMode: 'explicit',
        });
        node.port.addEventListener('message', this.onMessage);
        node.port.start();
        node.onprocessorerror = () => {
            if (generation === this.generation) {
                console.error('The rhythm audio worklet failed');
            }
        };
        analyser.connect(node);
        this.node = node;
    }

    // Disconnects and forgets the current worklet node, and invalidates any bind that is still loading.
    private unbind(): void {
        this.generation++;
        const node = this.node;
        this.node = undefined;
        if (!node) {
            return;
        }
        node.port.removeEventListener('message', this.onMessage);
        node.port.close();
        node.onprocessorerror = null;
        try {
            this.boundAnalyser?.disconnect(node);
        } catch {
            // Already disconnected: the analyser's audio context was closed when the capture stopped.
        }
        try {
            node.disconnect();
        } catch {
            // Same reason: nothing is left to disconnect once the context is closed.
        }
    }

    private loadModule(context: BaseAudioContext): Promise<void> {
        let loaded = this.loadedModules.get(context);
        if (!loaded) {
            loaded = context.audioWorklet.addModule(workletUrl);
            this.loadedModules.set(context, loaded);
            // A failed load is retried on the next bind instead of being remembered.
            loaded.catch(() => this.loadedModules.delete(context));
        }
        return loaded;
    }

    private readonly onMessage = (event: MessageEvent<FrameBatch>): void => {
        const analyzer = this.analyzer;
        const context = this.boundAnalyser?.context;
        if (!analyzer || !context) {
            return;
        }
        const batch = event.data;
        analyzer.pushBatch(batch.time0, batch.frames, batch.count);
        // Keeps the counters moving even when no visualizer is calling updatePhase().
        analyzer.updatePhase(context.currentTime);
        this.publish();
    };

    // Copies the low-rate values into the store fields and notifies only if one changed.
    private publish(): void {
        const beatsPerBar = this.state.beatsPerBar;
        const songChangeCount = this.state.songChangeCount;
        if (beatsPerBar === this.beatsPerBar && songChangeCount === this.songChangeCount) {
            return;
        }
        this.beatsPerBar = beatsPerBar;
        this.songChangeCount = songChangeCount;
        this.notify();
    }

    private notify(): void {
        // Copy first: a listener may unsubscribe while we iterate.
        for (const listener of [...this.listeners]) {
            try {
                listener();
            } catch (error) {
                // One failing subscriber must not stop the others from hearing the update.
                console.error('RhythmTracker listener failed', error);
            }
        }
    }
}

export const rhythmTracker = new RhythmTracker();
