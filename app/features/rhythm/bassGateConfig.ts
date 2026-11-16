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
// A bassline repeats every bar and scattered bass does not, so a kick is in rhythm when a kick landed at the same
// beat position this many beats (one bar) earlier, within this window (in beats, either side). Kicks that land at the
// learned place in the beat were the evidence before; one random kick in five lands there by chance, so enough scattered
// bass opened the gate (measured in bassGate.test.ts). A random kick repeats the previous bar's with the same chance, but
// real bass does it far more often, which the evidence below tells apart.
export const BASS_GATE_BAR_BEATS = 4;
export const BASS_GATE_BAR_WINDOW = 0.1;
// When nothing at all landed within this many beats of the place one bar back, that kick was masked, missed or
// rested, and the bar before it is compared instead. Replayed on `lonley`, whose bassline repeats every bar: one missed
// kick used to fail the kick that repeats it a bar later as well, and the gate opened 10 s after the tempo locked; with
// this it opens after 5.5 s. A whole beat, because random bass with a note on every beat always has one nearer than that
// (half a beat let random bass through: 4 of 205 patterns against 0).
export const BASS_GATE_EMPTY_RADIUS = 1;
// Evidence while closed is a running sum. Each kick adds the log of how much likelier its outcome (repeated an earlier
// bar or not) is for a real bassline, which repeats at least at the repeat rate, than for chance. The chance is the
// share of a beat covered by the bar windows of the kicks in the last DENSITY_BEATS beats, widened by the margin
// because a kick is only seen once per rendered frame, and kept between the two limits so no single kick decides.
// The sum never goes below 0 and the gate opens at the open score. Counting repeats without the chance (six of the
// last eight, the latest three in a row) opened on 52 of 100 random patterns with two notes per beat over 120 beats,
// because busy bass repeats by chance; this opens on 2, and on 0 of 205 with one note per beat over 40 beats. Once
// open, each kick at the learned place adds 1 up to the maximum, and the gate closes at the close score.
export const BASS_GATE_REPEAT_RATE = 0.6;
export const BASS_GATE_DENSITY_BEATS = 8;
export const BASS_GATE_CHANCE_MARGIN = 1.3;
export const BASS_GATE_CHANCE_MIN = 0.05;
export const BASS_GATE_CHANCE_MAX = 0.9;
export const BASS_GATE_KICK_HISTORY = 32;
export const BASS_GATE_SCORE_MAX = 8;
export const BASS_GATE_OPEN_SCORE = 6;
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
