import {
    FEATURE_ONSET_BANDS,
    FEATURE_ONSET_BAND_COUNT,
    HUB_BANDS,
    HUB_BAND_COUNT,
    METER_VISUAL_CONFIDENCE,
} from '~/features/rhythm/rhythmConfig';
import type { RhythmTracker } from '~/features/rhythm/rhythmTracker';
import { FEATURE_MESSAGE_VERSION, type FeatureBatch, type FeatureListener } from '~/features/rhythm/types';
import { GateBassTap, type GateBassLevel } from './gateBassTap';
import { HUB_FRAME_CAPACITY, HUB_MIN_PEAK, HUB_PEAK_HALF_LIFE_SECONDS, HUB_PENDING_ONSET_CAPACITY } from './hubConfig';
import type { AudioHubReader, AudioHubSnapshot, HubGateBass, HubOnset, HubOnsetBand } from './types';

const SUB_BAND = HUB_BANDS.indexOf('sub');
const KICK_BAND = HUB_BANDS.indexOf('kick');

// A NaN or infinite value from the worklet counts as silence, so it can neither stick in a running peak nor reach a
// consumer's threshold.
const finiteOrZero = (value: number): number => (Number.isFinite(value) ? value : 0);

function createOnset(): HubOnset {
    return { lastTime: -Infinity, strength: 0, sinceSeconds: Infinity, count: 0 };
}

export interface AudioHubOptions {
    // Reads the gate-input bass level instead of tapping the tracker's source: the offline replay's reader, or a
    // test's.
    gateBass?: GateBassLevel;
}

// The shared analysis of the music for every visualizer (contract C5): normalized band energies, onset events and the
// beat, all read at one render time so they agree with each other and with the user's sync offset.
//
// It hears the worklet through RhythmTracker.addFeatureListener. Batches arrive a few times a second and are written
// into preallocated rings; `update` then reads them at the render time, once per animation frame. The gate-input bass's
// level (contract C1) is not in the frames: the hub reads it from its own tap of the tracker's source (GateBassTap),
// which it rebuilds when the source changes and disconnects when there is none (the pulse then reads 0). That level is
// the newest audio: unlike `bands`, `lowEnd` and `beat`, it is not shifted by the user's sync offset, and it is read
// even in an update with no render time. Nothing else here allocates after the constructor.
export class AudioHub implements AudioHubReader, FeatureListener {
    // Updated in place for the hub's whole life; consumers may hold on to it.
    readonly snapshot: AudioHubSnapshot;

    private tracker: RhythmTracker | undefined;
    private removeListener: (() => void) | undefined;

    // Held frames, oldest first from `frameStart`. Times are AudioContext seconds; values are already normalized.
    private readonly frameTimes = new Float64Array(HUB_FRAME_CAPACITY);
    private readonly frameValues = new Float32Array(HUB_FRAME_CAPACITY * HUB_BAND_COUNT);
    // The unscaled low end of each held frame (contract C1's lowEnd).
    private readonly frameLowEnd = new Float32Array(HUB_FRAME_CAPACITY);
    private frameStart = 0;
    private frameCount = 0;
    // Running peak per band, in the frames' energy units, and the frame time it was last decayed to.
    private readonly peaks = new Float64Array(HUB_BAND_COUNT);
    private peakTime = -Infinity;

    // Onset events not yet reached by the render time, in arrival order (not necessarily time order across kinds).
    // Only update() empties this ring. While requestAnimationFrame is paused (a hidden tab) update() is not called, so
    // the ring fills and drops the oldest events, and `count` then undercounts what fired.
    private readonly pendingTimes = new Float64Array(HUB_PENDING_ONSET_CAPACITY);
    private readonly pendingKinds = new Uint8Array(HUB_PENDING_ONSET_CAPACITY);
    private readonly pendingStrengths = new Float32Array(HUB_PENDING_ONSET_CAPACITY);
    private pendingCount = 0;
    // The same objects as `snapshot.onsets`, by index in FEATURE_ONSET_BANDS.
    private readonly onsetByIndex: HubOnset[] = [];

    private lastUpdateTime = Number.NaN;
    private seenChangeCount = 0;

    // The gate-input bass level: the reader given to the constructor, or the tap of the tracker's current source.
    private readonly fixedGateBass: GateBassLevel | undefined;
    private tap: GateBassLevel | undefined;
    private tappedSource: AnalyserNode | undefined;
    private warnedVersion = false;

    constructor(options: AudioHubOptions = {}) {
        this.fixedGateBass = options.gateBass;
        const onsets = {} as Record<HubOnsetBand, HubOnset>;
        for (let i = 0; i < FEATURE_ONSET_BAND_COUNT; i++) {
            const onset = createOnset();
            this.onsetByIndex.push(onset);
            onsets[FEATURE_ONSET_BANDS[i]] = onset;
        }
        this.snapshot = {
            time: 0,
            bands: new Float32Array(HUB_BAND_COUNT),
            onsets,
            beat: {
                phase: undefined,
                barPhase: undefined,
                tempo: 0,
                confidence: 0,
                locked: false,
                beatsPerBar: undefined,
                barLocked: false,
                beatCount: 0,
                downbeatCount: 0,
            },
            section: { changeCount: 0, lastChangeTime: -Infinity },
            gateBass: { pulse: 0, lowEnd: 0 },
        };
    }

    // Starts listening to `tracker`. Calling it again with the same tracker does nothing; another tracker replaces
    // the first.
    public start(tracker: RhythmTracker): void {
        if (tracker === this.tracker) {
            return;
        }
        this.dispose();
        this.tracker = tracker;
        this.onReset();
        // A change that happened before the hub started is not news: only later ones set lastChangeTime.
        this.seenChangeCount = tracker.state.songChangeCount;
        this.snapshot.section.changeCount = this.seenChangeCount;
        this.removeListener = tracker.addFeatureListener(this);
    }

    // Stops listening. The snapshot stays readable, frozen at its last values.
    public dispose(): void {
        this.removeListener?.();
        this.removeListener = undefined;
        this.tracker = undefined;
        this.tap?.dispose();
        this.tap = undefined;
        this.tappedSource = undefined;
    }

    // Brings the snapshot up to `now`, or to the tracker's render time without an argument. With no render time only
    // the gate-input pulse is read (see below); `now` equal to the time of the last update does nothing, so any number
    // of readers may call it each frame.
    public update(now?: number): void {
        const tracker = this.tracker;
        const time = now ?? tracker?.renderTimeNow();
        if (time === undefined) {
            // No render time: the source is gone (a stopped capture) or the time is briefly unavailable. The pulse is
            // the newest audio and needs no render time, so it is still read: that frees the tap and zeroes the level
            // when the source is gone, and leaves no gap in it when the same source is still there. The rest of the
            // snapshot keeps its last values.
            if (tracker) {
                (this.snapshot.gateBass as HubGateBass).pulse = this.readGateBassLevel();
            }
            return;
        }
        if (time === this.lastUpdateTime) {
            return;
        }
        this.lastUpdateTime = time;
        this.snapshot.time = time;

        this.readBands(time);
        (this.snapshot.gateBass as HubGateBass).pulse = this.readGateBassLevel();
        this.revealOnsets(time);
        if (tracker) {
            this.readBeat(tracker, time);
        }
    }

    // Called by the tracker with every worklet message, after its own analysis has used it.
    public onBatch(batch: FeatureBatch): void {
        // A message of another version may lay its arrays out differently, so reading it as this one would write
        // garbage into the rings. The tracker does not check the version, so the hub skips what it cannot read, and
        // warns once per hub in development so the mismatch is not silent.
        if (batch.version !== FEATURE_MESSAGE_VERSION) {
            if (import.meta.env.DEV && !this.warnedVersion) {
                this.warnedVersion = true;
                console.warn(
                    `AudioHub: ignoring feature batches of version ${String(batch.version)}, expected ${String(FEATURE_MESSAGE_VERSION)}`,
                );
            }
            return;
        }
        for (let i = 0; i < batch.count; i++) {
            this.pushFrame(batch.frameTimes[i], batch.bandEnergy, i * HUB_BAND_COUNT);
        }
        for (let i = 0; i < batch.onsetCount; i++) {
            this.pushOnset(batch.onsetBand[i], batch.onsetTime[i], batch.onsetStrength[i]);
        }
    }

    // Called by the tracker for every new source: nothing from the old one may leak into the new one. The counters
    // keep counting, because consumers detect events by comparing with the value they saw last.
    public onReset(): void {
        this.frameStart = 0;
        this.frameCount = 0;
        this.peaks.fill(0);
        this.peakTime = -Infinity;
        this.pendingCount = 0;
        this.snapshot.bands.fill(0);
        const gateBass = this.snapshot.gateBass as HubGateBass;
        gateBass.pulse = 0;
        gateBass.lowEnd = 0;
        // Times from the old source are on the old AudioContext's clock, which the new one does not share: kept, they
        // would read as an onset or a change that just happened. The counts stay.
        for (const onset of this.onsetByIndex) {
            onset.lastTime = -Infinity;
            onset.strength = 0;
            onset.sinceSeconds = Infinity;
        }
        this.snapshot.section.lastChangeTime = -Infinity;
        // The next update must read again even at the same time, as the held frames are gone.
        this.lastUpdateTime = Number.NaN;
    }

    private pushFrame(time: number, energy: Float32Array, offset: number): void {
        // Decay by the frame time that passed, not per call, so the peak's memory does not depend on the batch size.
        const elapsed = time - this.peakTime;
        const decay = elapsed > 0 && elapsed < Infinity ? Math.pow(0.5, elapsed / HUB_PEAK_HALF_LIFE_SECONDS) : 1;
        // Only a forward step moves the peak's clock: a frame stamped earlier would otherwise make the next one decay
        // the peak by the whole span back to it.
        if (elapsed > 0) {
            this.peakTime = time;
        }

        // Overwrite the oldest frame when the ring is full.
        let slot: number;
        if (this.frameCount === HUB_FRAME_CAPACITY) {
            slot = this.frameStart;
            this.frameStart = (this.frameStart + 1) % HUB_FRAME_CAPACITY;
        } else {
            slot = (this.frameStart + this.frameCount) % HUB_FRAME_CAPACITY;
            this.frameCount++;
        }
        this.frameTimes[slot] = time;
        this.frameLowEnd[slot] = Math.max(
            finiteOrZero(energy[offset + SUB_BAND]),
            finiteOrZero(energy[offset + KICK_BAND]),
        );
        const base = slot * HUB_BAND_COUNT;
        for (let b = 0; b < HUB_BAND_COUNT; b++) {
            // A NaN or infinite energy would stick in the peak (Math.max with NaN stays NaN) and silence the band
            // until the next reset, so it counts as silence.
            const value = finiteOrZero(energy[offset + b]);
            // The peak is the loudest of the last few seconds. A fixed minimum keeps silence at 0 and stops a faint
            // hiss from being stretched to 1. The energies are logarithmic and 0 for silence, so no floor needs to be
            // subtracted first.
            const peak = Math.max(this.peaks[b] * decay, value);
            this.peaks[b] = peak;
            const scaled = value / Math.max(peak, HUB_MIN_PEAK);
            this.frameValues[base + b] = scaled > 1 ? 1 : scaled > 0 ? scaled : 0;
        }
    }

    private pushOnset(kind: number, time: number, strength: number): void {
        if (kind >= FEATURE_ONSET_BAND_COUNT) {
            return;
        }
        if (this.pendingCount === HUB_PENDING_ONSET_CAPACITY) {
            // Full: the render time has fallen far behind, so the oldest event is the one least worth keeping.
            this.pendingTimes.copyWithin(0, 1);
            this.pendingKinds.copyWithin(0, 1);
            this.pendingStrengths.copyWithin(0, 1);
            this.pendingCount--;
        }
        const slot = this.pendingCount++;
        this.pendingTimes[slot] = time;
        this.pendingKinds[slot] = kind;
        this.pendingStrengths[slot] = strength;
    }

    // Copies the newest held frame at or before `time`, or the oldest one when `time` precedes all of them: its bands
    // and its low end.
    private readBands(time: number): void {
        const bands = this.snapshot.bands;
        if (this.frameCount === 0) {
            bands.fill(0);
            (this.snapshot.gateBass as HubGateBass).lowEnd = 0;
            return;
        }
        let age = this.frameCount - 1;
        while (age > 0 && this.frameTimes[(this.frameStart + age) % HUB_FRAME_CAPACITY] > time) {
            age--;
        }
        const slot = (this.frameStart + age) % HUB_FRAME_CAPACITY;
        const base = slot * HUB_BAND_COUNT;
        for (let b = 0; b < HUB_BAND_COUNT; b++) {
            bands[b] = this.frameValues[base + b];
        }
        (this.snapshot.gateBass as HubGateBass).lowEnd = this.frameLowEnd[slot];
    }

    // The gate-input bass level now (the newest audio, not shifted by the sync offset), 0 with no source. A new source
    // gets a new tap and the old one is disconnected, so the old source's audio never reaches the level; this allocates
    // only then.
    private readGateBassLevel(): number {
        if (this.fixedGateBass) {
            return finiteOrZero(this.fixedGateBass.level());
        }
        const source = this.tracker?.getSource();
        if (source !== this.tappedSource) {
            this.tap?.dispose();
            this.tap = source ? new GateBassTap(source) : undefined;
            this.tappedSource = source;
        }
        return this.tap ? finiteOrZero(this.tap.level()) : 0;
    }

    // Makes the pending events at or before `time` visible and removes them from the pending list, keeping the rest
    // in order.
    private revealOnsets(time: number): void {
        let kept = 0;
        for (let i = 0; i < this.pendingCount; i++) {
            const eventTime = this.pendingTimes[i];
            if (eventTime <= time) {
                const onset = this.onsetByIndex[this.pendingKinds[i]];
                onset.count++;
                // Events of one kind can arrive out of time order across batches; never let an older one replace a
                // newer one.
                if (eventTime >= onset.lastTime) {
                    onset.lastTime = eventTime;
                    onset.strength = this.pendingStrengths[i];
                }
            } else {
                if (kept !== i) {
                    this.pendingTimes[kept] = eventTime;
                    this.pendingKinds[kept] = this.pendingKinds[i];
                    this.pendingStrengths[kept] = this.pendingStrengths[i];
                }
                kept++;
            }
        }
        this.pendingCount = kept;
        for (let i = 0; i < FEATURE_ONSET_BAND_COUNT; i++) {
            const onset = this.onsetByIndex[i];
            onset.sinceSeconds = onset.lastTime === -Infinity ? Infinity : Math.max(0, time - onset.lastTime);
        }
    }

    private readBeat(tracker: RhythmTracker, time: number): void {
        tracker.updatePhase(time);
        const state = tracker.state;
        const beat = this.snapshot.beat;
        beat.phase = state.beatPhase;
        beat.barPhase = state.barPhase;
        beat.tempo = state.bpm;
        beat.confidence = state.tempoConfidence;
        beat.locked = state.bpm > 0 && state.beatPhase !== undefined;
        beat.beatsPerBar = state.beatsPerBar;
        beat.barLocked = state.beatsPerBar !== undefined && state.meterConfidence >= METER_VISUAL_CONFIDENCE;
        beat.beatCount = state.beatCount;
        beat.downbeatCount = state.downbeatCount;

        const section = this.snapshot.section;
        section.changeCount = state.songChangeCount;
        if (state.songChangeCount !== this.seenChangeCount) {
            this.seenChangeCount = state.songChangeCount;
            section.lastChangeTime = time;
        }
    }
}

export const audioHub = new AudioHub();
