import {
    ACCENT_CHROMA_FLOOR,
    ACCENT_CHROMA_WEIGHT,
    ACCENT_KICK_WEIGHT,
    ACCENT_TOTAL_WEIGHT,
    FORGETTING_HALF_LIFE_SECONDS,
    METER_CONTRAST_WEIGHT,
    METER_ENTER_BARS,
    METER_ENTER_CONFIDENCE,
    METER_EXIT_BARS,
    METER_EXIT_CONFIDENCE,
    METER_LAG_RING_BEATS,
    METER_LAG_WEIGHT,
    METER_MARGIN_FULL,
    METER_MIN_BEATS,
    METER_PHASE_SWITCH_MARGIN,
    METER_PRIOR_FOUR,
    METER_SWITCH_BARS,
} from './rhythmConfig';
import type { BeatsPerBar } from './types';

// Hypotheses are every (meter, downbeat position) pair: three positions for 3 and four for 4.
const HYPOTHESES = 7;
const FIRST_HYPOTHESIS_OF_FOUR = 3;
const EPSILON = 1e-6;
const METERS = [3, 4] as const;

interface MeterScore {
    score: number;
    position: number;
}

function hypothesisIndex(meter: BeatsPerBar, position: number): number {
    return meter === 3 ? position : FIRST_HYPOTHESIS_OF_FOUR + position;
}

// Decides between 3 and 4 beats per bar and where the downbeat falls, from one accent value per beat. Pure and
// allocation-free after the constructor.
//
// Each hypothesis keeps leaky sums of the accent on its "downbeat" beats and on all other beats; its evidence is the
// difference of the two means. A meter's score adds the autocorrelation of the accent sequence at the bar length and
// at twice the bar length: if the beat tracker locked at double speed, the true bar is 6 or 8 beats and the longer
// lag still sees it. A prior favours 4, and a meter only changes after winning for several bars (hysteresis).
export class MeterEstimator {
    private readonly downbeatSum = new Float64Array(HYPOTHESES);
    private readonly downbeatWeight = new Float64Array(HYPOTHESES);
    private readonly otherSum = new Float64Array(HYPOTHESES);
    private readonly otherWeight = new Float64Array(HYPOTHESES);
    // Recent accents with their running mean removed, newest at `ringHead - 1`.
    private readonly accents = new Float32Array(METER_LAG_RING_BEATS);
    // Scratch results of the two scores, reused so a beat allocates nothing.
    private readonly threeScore: MeterScore = { score: 0, position: 0 };
    private readonly fourScore: MeterScore = { score: 0, position: 0 };
    private ringHead = 0;
    private ringCount = 0;
    // Leaky sums used to turn raw features into scale-free ones; divide by `meanWeight` to get the mean.
    private meanWeight = 0;
    private kickMean = 0;
    private totalMean = 0;
    private chromaMean = 0;
    private accentMean = 0;
    private beats = 0;

    private current: BeatsPerBar | undefined;
    private downbeatPosition = 0;
    private confidenceValue = 0;
    private candidate: BeatsPerBar | undefined;
    private candidateBeats = 0;
    private weakBeats = 0;

    // The meter, or undefined while unsure.
    get beatsPerBar(): BeatsPerBar | undefined {
        return this.current;
    }

    // 0..1 margin of the reported meter over the other one (or of the leading one while unsure).
    get confidence(): number {
        return this.confidenceValue;
    }

    // Position inside the bar (0 = downbeat) of the beat with this index, or -1 while the meter is unsure.
    barPosition(beatIndex: number): number {
        if (this.current === undefined) {
            return -1;
        }
        return (((beatIndex - this.downbeatPosition) % this.current) + this.current) % this.current;
    }

    // Adds one beat. `kick` and `total` are the summed onset flux near the beat in the kick band and in all bands,
    // `chromaChange` is 0..1 how much the harmony changed on the beat, and `periodSeconds` is the beat period (it
    // sets how much one beat forgets). `beatIndex` must increase by one per beat.
    addBeat(beatIndex: number, kick: number, total: number, chromaChange: number, periodSeconds: number): void {
        const decay = Math.pow(0.5, periodSeconds / FORGETTING_HALF_LIFE_SECONDS);
        this.beats++;

        // Features are divided by their own running mean so the accent does not depend on the volume or the mix. The
        // means are leaky sums divided by their total weight (bias-corrected), so they are true averages from the first
        // beat on. Started from the first value instead, a cue that happened to be 0 on beat 1 would have a mean near
        // 0 for many seconds, its next blip would count dozens of times over, and the downbeat would lock onto it.
        this.meanWeight = this.meanWeight * decay + (1 - decay);
        this.kickMean = this.kickMean * decay + kick * (1 - decay);
        this.totalMean = this.totalMean * decay + total * (1 - decay);
        this.chromaMean = this.chromaMean * decay + chromaChange * (1 - decay);
        const accent =
            ACCENT_KICK_WEIGHT * (kick / (this.kickMean / this.meanWeight + EPSILON)) +
            ACCENT_TOTAL_WEIGHT * (total / (this.totalMean / this.meanWeight + EPSILON)) +
            // Without harmony the chroma change is near 0 and mostly noise; the floor stops that noise from being
            // scaled up into a full-size accent.
            ACCENT_CHROMA_WEIGHT * (chromaChange / Math.max(this.chromaMean / this.meanWeight, ACCENT_CHROMA_FLOOR));
        this.accentMean = this.accentMean * decay + accent * (1 - decay);

        this.accents[this.ringHead] = accent - this.accentMean / this.meanWeight;
        this.ringHead = (this.ringHead + 1) % METER_LAG_RING_BEATS;
        this.ringCount = Math.min(this.ringCount + 1, METER_LAG_RING_BEATS);

        for (let h = 0; h < HYPOTHESES; h++) {
            this.downbeatSum[h] *= decay;
            this.downbeatWeight[h] *= decay;
            this.otherSum[h] *= decay;
            this.otherWeight[h] *= decay;
        }
        for (const meter of METERS) {
            const position = ((beatIndex % meter) + meter) % meter;
            for (let candidate = 0; candidate < meter; candidate++) {
                const h = hypothesisIndex(meter, candidate);
                if (candidate === position) {
                    this.downbeatSum[h] += accent;
                    this.downbeatWeight[h] += 1;
                } else {
                    this.otherSum[h] += accent;
                    this.otherWeight[h] += 1;
                }
            }
        }
        this.decide();
    }

    // Keeps only `keep` (0..1) of the evidence, e.g. after a song change or when the beat numbering was broken.
    shrink(keep: number): void {
        for (let h = 0; h < HYPOTHESES; h++) {
            this.downbeatSum[h] *= keep;
            this.downbeatWeight[h] *= keep;
            this.otherSum[h] *= keep;
            this.otherWeight[h] *= keep;
        }
        this.ringCount = Math.floor(this.ringCount * keep);
        this.beats = Math.floor(this.beats * keep);
        this.candidate = undefined;
        this.candidateBeats = 0;
        this.weakBeats = 0;
        if (this.beats < METER_MIN_BEATS) {
            this.current = undefined;
            this.confidenceValue = 0;
        }
    }

    reset(): void {
        this.downbeatSum.fill(0);
        this.downbeatWeight.fill(0);
        this.otherSum.fill(0);
        this.otherWeight.fill(0);
        this.accents.fill(0);
        this.ringHead = 0;
        this.ringCount = 0;
        this.meanWeight = 0;
        this.kickMean = 0;
        this.totalMean = 0;
        this.chromaMean = 0;
        this.accentMean = 0;
        this.beats = 0;
        this.current = undefined;
        this.downbeatPosition = 0;
        this.confidenceValue = 0;
        this.candidate = undefined;
        this.candidateBeats = 0;
        this.weakBeats = 0;
    }

    // Accent contrast of one hypothesis: mean accent on its downbeats minus mean accent elsewhere.
    private contrast(h: number): number {
        if (this.downbeatWeight[h] < 1 || this.otherWeight[h] < 1) {
            return 0;
        }
        return this.downbeatSum[h] / this.downbeatWeight[h] - this.otherSum[h] / this.otherWeight[h];
    }

    // Normalised autocorrelation of the accent sequence at `lag` beats, -1..1.
    private lagCorrelation(lag: number): number {
        const n = this.ringCount;
        if (n <= lag + 2) {
            return 0;
        }
        let cross = 0;
        let energyNew = 0;
        let energyOld = 0;
        for (let i = lag; i < n; i++) {
            const newer = this.accents[this.ringSlot(n - 1 - i)];
            const older = this.accents[this.ringSlot(n - 1 - (i - lag))];
            cross += newer * older;
            energyNew += newer * newer;
            energyOld += older * older;
        }
        return cross / (Math.sqrt(energyNew * energyOld) + EPSILON);
    }

    // Slot of the accent `back` beats before the newest.
    private ringSlot(back: number): number {
        return (this.ringHead - 1 - back + 2 * METER_LAG_RING_BEATS) % METER_LAG_RING_BEATS;
    }

    private scoreOf(meter: BeatsPerBar, out: MeterScore): void {
        let bestContrast = -Infinity;
        let bestPosition = 0;
        for (let p = 0; p < meter; p++) {
            const value = this.contrast(hypothesisIndex(meter, p));
            if (value > bestContrast) {
                bestContrast = value;
                bestPosition = p;
            }
        }
        const lag = (this.lagCorrelation(meter) + this.lagCorrelation(meter * 2)) / 2;
        const prior = meter === 4 ? METER_PRIOR_FOUR : 0;
        out.score = METER_CONTRAST_WEIGHT * bestContrast + METER_LAG_WEIGHT * lag + prior;
        out.position = bestPosition;
    }

    private decide(): void {
        if (this.beats < METER_MIN_BEATS) {
            return;
        }
        const three = this.threeScore;
        const four = this.fourScore;
        this.scoreOf(3, three);
        this.scoreOf(4, four);
        const leader: BeatsPerBar = four.score >= three.score ? 4 : 3;
        const leaderResult = leader === 4 ? four : three;
        const marginForLeader = Math.abs(four.score - three.score) / METER_MARGIN_FULL;

        if (this.current === undefined) {
            this.confidenceValue = Math.min(1, marginForLeader);
            if (marginForLeader >= METER_ENTER_CONFIDENCE) {
                this.candidateBeats = this.candidate === leader ? this.candidateBeats + 1 : 1;
                this.candidate = leader;
                if (this.candidateBeats >= METER_ENTER_BARS * leader) {
                    this.adopt(leader, leaderResult.position);
                }
            } else {
                this.candidate = undefined;
                this.candidateBeats = 0;
            }
            return;
        }

        const own = this.current === 4 ? four : three;
        const other = this.current === 4 ? three : four;
        const signedMargin = (own.score - other.score) / METER_MARGIN_FULL;
        this.confidenceValue = Math.min(1, Math.max(0, signedMargin));

        if (leader !== this.current && marginForLeader >= METER_ENTER_CONFIDENCE) {
            this.candidateBeats = this.candidate === leader ? this.candidateBeats + 1 : 1;
            this.candidate = leader;
            if (this.candidateBeats >= METER_SWITCH_BARS * leader) {
                this.adopt(leader, leaderResult.position);
            }
            return;
        }
        this.candidate = undefined;
        this.candidateBeats = 0;

        // The downbeat position follows the evidence, but only when another position is clearly better.
        const currentContrast = this.contrast(hypothesisIndex(this.current, this.downbeatPosition));
        if (
            own.position !== this.downbeatPosition &&
            this.contrast(hypothesisIndex(this.current, own.position)) > currentContrast + METER_PHASE_SWITCH_MARGIN
        ) {
            this.downbeatPosition = own.position;
        }

        // The other meter leading (a negative margin) is weak evidence for this one too, not strong evidence.
        if (signedMargin < METER_EXIT_CONFIDENCE) {
            this.weakBeats++;
            if (this.weakBeats >= METER_EXIT_BARS * this.current) {
                this.current = undefined;
                this.weakBeats = 0;
            }
        } else {
            this.weakBeats = 0;
        }
    }

    private adopt(meter: BeatsPerBar, position: number): void {
        this.current = meter;
        this.downbeatPosition = position;
        this.candidate = undefined;
        this.candidateBeats = 0;
        this.weakBeats = 0;
    }
}
