// The expected track list of the scorecard. A track listed here but missing from the input folder gives unavailable
// cells, never a silent skip, so a forgotten or renamed WAV shows up in the report.

import type { TrackClass } from './types';

export interface TrackSpec {
    name: string;
    class: TrackClass;
    // Whether the track has a kick drum, which decides if the dancing character's gate should open on it.
    kick: boolean;
    // True for tracks the runner generates in memory instead of reading from .debug-in.
    generated: boolean;
}

// The sidecar sources a .beats.json can declare.
export type SidecarSource = 'synthetic' | 'tapped';

// PROVISIONAL kick flags: the one place to edit when a listening check disagrees. Every listed track not in this
// table is a non-kick track: click-*, no-kick-124, syncopation-no-kick and pad-lead-groove-110 by design, and
// 6-8-time and drifting-tempo by assumption (those two are unconfirmed, see KICK_UNCONFIRMED).
const KICK_TRACKS: readonly string[] = [
    'drums-100.wav',
    'drums-128.wav',
    'drums-150.wav',
    'trap-2to1-double-90.wav',
    'trap-2to1-half-140.wav',
    'trap-4to3-120.wav',
    'imyourgirl.wav',
    'lonley.wav',
    'summer2000.wav',
    'syncopationbass.wav',
    'syncopationbass2.wav',
    'high-bpm-dnb.wav',
    'low-bpm-rnb.wav',
    'half-time-shuffle.wav',
    'bassline-kick-120.wav',
];

// Non-kick flags that nobody has confirmed by ear yet.
export const KICK_UNCONFIRMED: readonly string[] = ['6-8-time.wav', 'drifting-tempo.wav'];

// Class overrides win over the sidecar's source. beatless.wav has no .beats.json by design: its no-beat truth lives
// here because the sidecar format requires a tempo above 0.
const CLASS_OVERRIDES: Readonly<Record<string, TrackClass>> = {
    'drifting-tempo.wav': 'drifting',
    'beatless.wav': 'beatless',
};

const SYNTHETIC: readonly string[] = [
    'click-90',
    'click-120',
    'click-140',
    'click-174',
    'drums-100',
    'drums-128',
    'drums-150',
    'no-kick-124',
    'trap-2to1-double-90',
    'trap-2to1-half-140',
    'trap-4to3-120',
];
const TAPPED: readonly string[] = [
    'imyourgirl',
    'lonley',
    'summer2000',
    'syncopation-no-kick',
    'syncopationbass',
    'syncopationbass2',
    'high-bpm-dnb',
    'low-bpm-rnb',
    '6-8-time',
    'half-time-shuffle',
];
const GENERATED: readonly string[] = ['bassline-kick-120', 'pad-lead-groove-110'];

function spec(stem: string, trackClass: TrackClass, generated: boolean): TrackSpec {
    const name = `${stem}.wav`;
    return { name, class: trackClass, kick: KICK_TRACKS.includes(name), generated };
}

export const EXPECTED_TRACKS: readonly TrackSpec[] = [
    ...SYNTHETIC.map((stem) => spec(stem, 'synthetic', false)),
    ...TAPPED.map((stem) => spec(stem, 'tapped', false)),
    spec('drifting-tempo', 'drifting', false),
    spec('beatless', 'beatless', false),
    ...GENERATED.map((stem) => spec(stem, 'synthetic', true)),
];

export const EXPECTED_TRACK_NAMES: readonly string[] = EXPECTED_TRACKS.map((track) => track.name);

// Resolves a track's class and kick flag from its name and, when there is a sidecar, its declared source. A listed
// track whose sidecar is missing keeps its expected class from the list. A name outside the list is classed from the
// sidecar (tapped when there is none) and is never a kick track.
export function resolveTrack(name: string, sidecarSource?: SidecarSource): { class: TrackClass; kick: boolean } {
    const listed = EXPECTED_TRACKS.find((track) => track.name === name);
    const trackClass: TrackClass = CLASS_OVERRIDES[name] ?? sidecarSource ?? listed?.class ?? 'tapped';
    return { class: trackClass, kick: listed?.kick ?? false };
}
