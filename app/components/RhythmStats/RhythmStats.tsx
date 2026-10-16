import { useEffect, useState } from 'react';
import { useRhythm } from '~/features/rhythm/rhythmTrackerContext';
import type { BeatsPerBar } from '~/features/rhythm/types';

// How often the overlay updates. The tracker's values change faster, but a readout needs no more than this.
const SAMPLE_INTERVAL_MS = 100;
// How many samples the "new song" flash stays lit (about a second).
const FLASH_SAMPLES = 10;
const BAND_LABELS = ['kick', 'mid ', 'high'] as const;
// Beats drawn in the bar dial while the meter is unsure.
const UNSURE_DIAL_BEATS = 4;

interface Reading {
    bpm: number;
    tempoConfidence: number;
    beatsPerBar: BeatsPerBar | undefined;
    meterConfidence: number;
    kick: number;
    mid: number;
    high: number;
    beatPhase: number;
    barPhase: number;
    flash: boolean;
}

const IDLE: Reading = {
    bpm: 0,
    tempoConfidence: 0,
    beatsPerBar: undefined,
    meterConfidence: 0,
    kick: 0,
    mid: 0,
    high: 0,
    beatPhase: 0,
    barPhase: 0,
    flash: false,
};

// Debug overlay for the rhythm tracker: tempo, meter, per-band onsets, where we are in the beat and bar, and a flash
// when a song change was detected.
export function RhythmStats() {
    const tracker = useRhythm();
    const [reading, setReading] = useState<Reading>(IDLE);

    useEffect(() => {
        let seenSongChanges = tracker.state.songChangeCount;
        let flashSamples = 0;

        const timer = window.setInterval(() => {
            tracker.updatePhase();
            const state = tracker.state;
            // The flash countdown lives in plain variables, read before setState; only the summary goes into state.
            if (state.songChangeCount !== seenSongChanges) {
                seenSongChanges = state.songChangeCount;
                flashSamples = FLASH_SAMPLES;
            }
            const flash = flashSamples > 0;
            if (flash) {
                flashSamples--;
            }
            setReading({
                bpm: state.bpm,
                tempoConfidence: state.tempoConfidence,
                beatsPerBar: state.beatsPerBar,
                meterConfidence: state.meterConfidence,
                kick: state.bandOnsets[0],
                mid: state.bandOnsets[1],
                high: state.bandOnsets[2],
                beatPhase: state.beatPhase,
                barPhase: state.barPhase,
                flash,
            });
        }, SAMPLE_INTERVAL_MS);

        return () => window.clearInterval(timer);
    }, [tracker]);

    const bands = [reading.kick, reading.mid, reading.high];
    const dialBeats = reading.beatsPerBar ?? UNSURE_DIAL_BEATS;
    const activeBeat = Math.min(dialBeats - 1, Math.floor(reading.barPhase * dialBeats));

    return (
        <div className="pointer-events-none fixed bottom-3 right-3 z-10 w-56 rounded-md bg-black/75 px-2.5 py-2 font-mono text-xs text-[#9f9]">
            <div className="flex items-center justify-between">
                <b>Rhythm</b>
                <span className={reading.flash ? 'rounded bg-[#9f9] px-1 text-black' : 'px-1 opacity-30'}>new song</span>
            </div>
            <div>
                {reading.bpm > 0 ? `${reading.bpm.toFixed(1)} BPM` : 'tempo: listening'} · {percent(reading.tempoConfidence)}
            </div>
            <div>
                {reading.beatsPerBar ? `${reading.beatsPerBar} beats per bar` : 'meter: unsure'} · {percent(reading.meterConfidence)}
            </div>
            <div className="mt-1.5 space-y-0.5">
                {bands.map((level, index) => (
                    <div key={BAND_LABELS[index]} className="flex items-center gap-1.5">
                        <span className="w-8 whitespace-pre">{BAND_LABELS[index]}</span>
                        <div className="h-1.5 flex-1 rounded bg-white/15">
                            <div className="h-full rounded bg-[#9f9]" style={{ width: percent(level) }} />
                        </div>
                    </div>
                ))}
            </div>
            <div className="mt-1.5 flex gap-1">
                {Array.from({ length: dialBeats }, (_, beat) => (
                    <div
                        key={beat}
                        className={beat === activeBeat
                            ? beat === 0 && reading.beatsPerBar ? 'h-3 flex-1 rounded bg-[#ff9]' : 'h-3 flex-1 rounded bg-[#9f9]'
                            : 'h-3 flex-1 rounded bg-white/15'}
                    />
                ))}
            </div>
            <div className="mt-1 h-1 rounded bg-white/15">
                <div className="h-full rounded bg-[#9f9]" style={{ width: percent(reading.beatPhase) }} />
            </div>
        </div>
    );
}

function percent(fraction: number): string {
    return `${Math.round(fraction * 100)}%`;
}
