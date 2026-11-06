// Bass gate (bassGate.ts): the bass shows as a pulse on the beat once its kicks lock onto one place in
// the beat, and then keeps going until the bassline has clearly changed, because music almost never changes quickly.
// Kicks are found relative to the raw bass's own recent dip, not at fixed levels: the bass pulse compares the bass with
// its last ~1.5 s, so after silence a kick reaches near 1, but a few seconds into a song the same kick is only a small
// rise on top of a raised floor, and fixed levels then miss every kick (measured: the gate opened at a song's start and
// closed 10 to 15 s later). A kick is the raw bass rising this far above its lowest point since the last kick...
export const BASS_GATE_ONSET_RISE = 0.08;
// ...while at least this high, so noise near silence is not a kick.
export const BASS_GATE_MIN_LEVEL = 0.05;
// After a kick, the raw bass must fall this far below its peak before the next kick can count, so one long boom is one
// kick, not several.
export const BASS_GATE_REARM_FALL = 0.04;
// A kick's strength is its rise over this, but never below the minimum, so every bump reads clearly however loud the
// song has been recently. The bump shown on each beat follows the kicks' strength slowly, by this share per kick.
export const BASS_GATE_FULL_RISE = 0.3;
export const BASS_GATE_MIN_STRENGTH = 0.6;
export const BASS_GATE_STRENGTH_ADAPT = 0.15;
// Kicks count as in rhythm when they land at the same place in the beat as the kicks before them, within this window
// (in beats, either side). The place is learned rather than fixed at the beat: measured on a real 135 BPM track, the
// bass pulse reports each kick 0.11 to 0.21 beats after the tracker's beat (its filters and envelope lag the audio),
// and a fixed window around the beat threw out half of a perfectly steady bassline.
export const BASS_GATE_PHASE_WINDOW = 0.1;
// How far each in-rhythm kick pulls the learned place toward itself, so it follows slow drift without jumping.
export const BASS_GATE_PHASE_ADAPT = 0.1;
// Evidence: an in-rhythm kick adds 1 up to the maximum. The gate opens at the open score (four kicks in a row at one
// place, after the one that set it) and closes at the close score.
export const BASS_GATE_SCORE_MAX = 8;
export const BASS_GATE_OPEN_SCORE = 4;
export const BASS_GATE_CLOSE_SCORE = 1;
// Evidence lost per beat, but only once no kick has landed at the learned place for this many beats (four bars), so
// masked kicks, breaks and fills do not drop the pulse; a bassline that has really changed closes the gate after about
// six bars, and its new place is then learned.
export const BASS_GATE_GRACE_BEATS = 16;
export const BASS_GATE_SCORE_DECAY = 1;
// The tracker's tempo lock can dip in busy passages while the music carries on; the gate keeps the learned bassline
// until the lock has been gone this long.
export const BASS_GATE_LOCK_GRACE_SECONDS = 4;
// Bumps never start closer together than this. It is above a third of a second so the bass can never start more than
// three reactions in any one second, however fast the tempo.
export const BASS_GATE_MIN_INTERVAL = 0.35;
// Each bump rises over the attack time and fades with the release time constant, so the ring and camera breathe with
// the beat rather than twitch.
export const BASS_GATE_ATTACK_SECONDS = 0.05;
export const BASS_GATE_RELEASE_SECONDS = 0.25;
// How long the gate takes to fade the bass in and out, slow so that opening and closing are never noticed as events.
export const BASS_GATE_EASE_SECONDS = 1.5;
// Longest step one call may advance the gate by, so a stalled tab does not skip the envelope forward in one frame.
export const BASS_GATE_MAX_STEP_SECONDS = 0.1;
