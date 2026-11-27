import * as THREE from 'three';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { defaultValues } from '~/components/ControlPanel/controls';
import { asWebAudio, FakeAnalyserNode, FakeAudioContext } from '~/test/fakeWebAudio';
import {
    ANALYSER_MAX_DECIBELS,
    BACK_RISE_RATE,
    BANDS,
    BASE_HEIGHT,
    FLAG_DEPTH,
    FLAG_DISTANCE,
    FLAG_WIDTH,
    PEAK_DECAY,
    ROW_FALLOFF,
    SHEET_SPACING,
} from './trioColorWaveConfig';
import { trioColorWaveControls } from './trioColorWaveControls';
import { createSheetColors, TrioColorWaveSheet } from './trioColorWaveSheet';

const values = defaultValues(trioColorWaveControls);
const SHEET_COUNT = 3;
const FRONT_ROW = FLAG_DEPTH - 1;
const GOLDEN: number[][][] = [
    [
        [161.5315094, 161.5315094, 200, 183039.3627, 117.615097],
        [160.7238519, 33.25638199, 41.38325657, 230372.5702, 109.9932861],
        [159.9202326, 0, 0, 234129.5309, 102.2919006],
        [159.1206314, 95.67893982, 120.2596281, 226780.6532, 94.51033783],
        [192.3510895, 192.3510895, 200, 229516.9761, 103.7073746],
        [191.389334, 36.2980957, 37.93115838, 230792.7052, 97.33158112],
        [190.4323874, 0, 0, 218450.3352, 90.88909149],
        [189.4802254, 117.2521515, 123.7618873, 210155.0485, 84.37939453],
        [188.5328243, 155.7905731, 165.2662593, 238523.4825, 92.90988159],
        [187.5901602, 30.63813591, 32.66497121, 234868.8574, 86.34014893],
        [186.6522094, 0, 0, 221103.9938, 79.70204926],
        [185.7189483, 109.9400177, 118.3939697, 209099.645, 82.22225952],
        [189.2595215, 189.2595215, 200, 239475.0974, 73.70954132],
        [188.3132239, 36.86289215, 39.15061448, 238031.3407, 67.07034302],
    ],
    [
        [225.8991852, 225.8991852, 200, 94702.57863, 75.46031189],
        [224.7696893, 45.46811295, 40.45751284, 146131.8914, 70.19664001],
        [223.6458408, 0, 0, 188752.4141, 64.87815094],
        [222.5276116, 127.258667, 114.3756193, 228765.1257, 71.85870361],
        [221.4149735, 210.4208984, 190.0692578, 291300.1913, 114.6138077],
        [220.3078987, 46.71165848, 42.40579549, 331035.5078, 109.4326019],
        [219.2063592, 0, 0, 360095.4475, 104.1964188],
        [218.1103274, 126.0547791, 115.5880884, 382441.9385, 113.6642227],
        [217.0197758, 182.5193634, 168.2052825, 416128.817, 168.7369995],
        [215.9346769, 49.30553436, 45.66708328, 434478.1383, 163.7111664],
        [214.8550035, 0, 0, 444622.3033, 158.6305542],
        [213.7807285, 125.7744751, 117.6668037, 451096.6633, 153.494751],
        [216.3786621, 216.3786621, 200, 474338.8979, 195.6842041],
        [215.2967688, 39.6872406, 36.86747444, 488883.2527, 190.7763977],
    ],
    [
        [226.8607635, 226.8607635, 200, 35793.68918, 51.11425781],
        [225.7264597, 48.55789185, 43.02365961, 47518.96433, 57.98200607],
        [224.5978274, 0, 0, 58147.79714, 55.46255493],
        [223.4748383, 109.6219864, 98.10678215, 75974.37915, 72.77040863],
        [222.3574641, 194.8970642, 175.3006718, 106648.8272, 121.1606827],
        [221.2456768, 47.72491074, 43.14200524, 124214.9105, 118.9161148],
        [220.1394484, 0, 0, 140824.2165, 116.6459351],
        [219.0387512, 140.1891937, 128.0040111, 162017.3082, 146.6491699],
        [223.8947296, 223.8947296, 200, 187403.4447, 150.7724609],
        [222.775256, 44.64883804, 40.08419862, 207323.6125, 148.6962891],
        [221.6613797, 0, 0, 226200.836, 146.5954437],
        [220.5530728, 95.56389618, 86.65841284, 244513.9089, 144.4697418],
        [224.4570618, 224.4570618, 200, 265104.0656, 139.1443787],
        [223.3347765, 45.08119965, 40.3709627, 283872.4854, 137.0168762],
    ],
];

function heightOf(sheet: TrioColorWaveSheet, column: number, row: number): number {
    return sheet.flags.heightAttribute.array[column * FLAG_DEPTH + row];
}

interface Harness {
    context: FakeAudioContext;
    source: FakeAnalyserNode;
    sheet: TrioColorWaveSheet;
    // The analyser the sheet created when it connected.
    tap: () => FakeAnalyserNode;
}

function createHarness(index = 0): Harness {
    const context = new FakeAudioContext();
    const source = context.createAnalyser();
    const sheet = new TrioColorWaveSheet(BANDS[0], index, SHEET_COUNT);
    return { context, source, sheet, tap: () => context.createdAnalysers[context.createdAnalysers.length - 1] };
}

describe('TrioColorWaveSheet', () => {
    let harness: Harness;

    beforeEach(() => {
        harness = createHarness();
    });

    describe('connecting', () => {
        it('taps its own analyser from the source with the band window and noise floor', () => {
            harness.sheet.connect(asWebAudio<AnalyserNode>(harness.source));
            const tap = harness.tap();
            expect(tap).not.toBe(harness.source);
            expect(tap.fftSize).toBe(BANDS[0].fftSize);
            expect(tap.minDecibels).toBe(BANDS[0].minDecibels);
            expect(tap.maxDecibels).toBe(ANALYSER_MAX_DECIBELS);
            expect(harness.source.connect).toHaveBeenCalledWith(tap);
        });

        it('drops the previous tap when it is connected again', () => {
            harness.sheet.connect(asWebAudio<AnalyserNode>(harness.source));
            const first = harness.tap();
            harness.sheet.connect(asWebAudio<AnalyserNode>(harness.source));
            expect(harness.source.disconnect).toHaveBeenCalledWith(first);
            expect(first.disconnect).toHaveBeenCalled();
            expect(harness.tap()).not.toBe(first);
        });

        it('disconnects its tap and stops updating', () => {
            harness.sheet.connect(asWebAudio<AnalyserNode>(harness.source));
            const tap = harness.tap();
            harness.sheet.disconnect();
            expect(harness.source.disconnect).toHaveBeenCalledWith(tap);
            expect(tap.disconnect).toHaveBeenCalled();

            tap.setByteFrequencyData(255);
            harness.sheet.update(values);
            expect(tap.getByteFrequencyData).not.toHaveBeenCalled();
        });

        it('does nothing when disconnecting twice or before connecting', () => {
            expect(() => harness.sheet.disconnect()).not.toThrow();
            harness.sheet.connect(asWebAudio<AnalyserNode>(harness.source));
            harness.sheet.disconnect();
            harness.source.disconnect.mockClear();
            harness.sheet.disconnect();
            expect(harness.source.disconnect).not.toHaveBeenCalled();
        });

        it('still releases its own analyser when the source was already disconnected', () => {
            harness.sheet.connect(asWebAudio<AnalyserNode>(harness.source));
            const tap = harness.tap();
            harness.source.disconnect.mockImplementation(() => {
                throw new Error('context closed');
            });
            expect(() => harness.sheet.disconnect()).not.toThrow();
            expect(tap.disconnect).toHaveBeenCalled();
        });
    });

    describe('place', () => {
        it('centres the sheet horizontally and puts it on the base line', () => {
            harness.sheet.place(0, 0);
            const { position } = harness.sheet.flags.mesh;
            expect(position.x).toBeCloseTo((-(FLAG_WIDTH - 1) * FLAG_DISTANCE) / 2, 5);
            expect(position.y).toBe(BASE_HEIGHT);
            expect(position.z).toBeCloseTo(0, 10);
        });

        it('applies the move sliders and stacks later sheets behind', () => {
            const back = createHarness(2);
            back.sheet.place(100, 25);
            const { position } = back.sheet.flags.mesh;
            expect(position.x).toBeCloseTo((-(FLAG_WIDTH - 1) * FLAG_DISTANCE) / 2 + 100, 5);
            expect(position.y).toBe(BASE_HEIGHT + 25);
            expect(position.z).toBe(-2 * SHEET_SPACING);
        });
    });

    describe('update', () => {
        it('does nothing before it is connected', () => {
            harness.sheet.update(values);
            expect(Array.from(harness.sheet.flags.heightAttribute.array).every((height) => height === 0)).toBe(true);
        });

        it('exposes the frame level, the peak and the balanced level for telemetry', () => {
            harness.sheet.connect(asWebAudio<AnalyserNode>(harness.source));
            harness.tap().setByteFrequencyData(255);

            harness.sheet.update(values);

            const { frameLevel, peak: peakLevel, balancedLevel } = harness.sheet;
            expect(frameLevel).toBeGreaterThan(0);
            expect(peakLevel).toBe(frameLevel);
            // A band at its own peak is balanced to the target level (200).
            expect(balancedLevel).toBeCloseTo(200);
        });

        it('keeps the bars flat for silence', () => {
            harness.sheet.connect(asWebAudio<AnalyserNode>(harness.source));
            harness.tap().setByteFrequencyData(0);
            harness.sheet.update(values);
            expect(heightOf(harness.sheet, 10, FRONT_ROW)).toBe(0);
        });

        it('jumps the nearest row to a loud spectrum, scaled so a full-scale peak maps to the target level', () => {
            harness.sheet.connect(asWebAudio<AnalyserNode>(harness.source));
            harness.tap().setByteFrequencyData(255);
            harness.sheet.update(values);
            // Front row of the front sheet rises straight up: 255 * (200 / 255) * highs 1 * master 1 * 1.5 * 0.55 falloff.
            expect(heightOf(harness.sheet, 100, FRONT_ROW)).toBeCloseTo(200 * 1.5 * ROW_FALLOFF[FRONT_ROW], 2);
        });

        it('lets farther rows chase the row in front of them, so a hit travels back as a ripple', () => {
            harness.sheet.connect(asWebAudio<AnalyserNode>(harness.source));
            harness.tap().setByteFrequencyData(255);
            harness.sheet.update(values);
            // Undo the per-row falloff to compare the underlying bar heights.
            const raw = (row: number) => heightOf(harness.sheet, 100, row) / ROW_FALLOFF[row];
            for (let row = FRONT_ROW; row > 0; row--) {
                expect(raw(row - 1)).toBeLessThan(raw(row));
            }
            expect(heightOf(harness.sheet, 100, 0)).toBeGreaterThan(0);

            // Another frame closes more of the gap.
            const before = raw(0);
            harness.sheet.update(values);
            expect(raw(0)).toBeGreaterThan(before);
        });

        it('lets bars fall by the fall speed once the spectrum drops, using the decayed peak for the gain', () => {
            harness.sheet.connect(asWebAudio<AnalyserNode>(harness.source));
            const tap = harness.tap();
            tap.setByteFrequencyData(255);
            harness.sheet.update(values);
            tap.setByteFrequencyData(0);
            harness.sheet.update(values);
            const gain = 200 / (255 * PEAK_DECAY);
            const expected = (255 - values.fall) * gain * 1.5 * ROW_FALLOFF[FRONT_ROW];
            expect(heightOf(harness.sheet, 100, FRONT_ROW)).toBeCloseTo(expected, 2);
        });

        it('multiplies the height by the band, master and growth settings, with later sheets taller', () => {
            const taller = { ...values, masterHeight: 2, highsHeight: 3 };
            harness.sheet.connect(asWebAudio<AnalyserNode>(harness.source));
            harness.tap().setByteFrequencyData(255);
            harness.sheet.update(taller);
            expect(heightOf(harness.sheet, 100, FRONT_ROW)).toBeCloseTo(200 * 6 * 1.5 * ROW_FALLOFF[FRONT_ROW], 2);

            const back = createHarness(1);
            back.sheet.connect(asWebAudio<AnalyserNode>(back.source));
            back.tap().setByteFrequencyData(255);
            back.sheet.update(values);
            // The second sheet's nearest row is a third of the way back (8 of 23 rows), so it rises at a slower rate.
            const rise = 1 - (1 - BACK_RISE_RATE) * (FLAG_DEPTH / (SHEET_COUNT * FLAG_DEPTH - 1));
            expect(heightOf(back.sheet, 100, FRONT_ROW)).toBeCloseTo(
                200 * rise * 1.5 * values.heightGrowth * ROW_FALLOFF[FRONT_ROW],
                2,
            );
        });

        it('does not boost a quiet band beyond what the peak floor allows, so near-silence stays small', () => {
            harness.sheet.connect(asWebAudio<AnalyserNode>(harness.source));
            harness.tap().setByteFrequencyData(6);
            harness.sheet.update(values);
            // Gain is 200 / 60, not 200 / 6.
            expect(heightOf(harness.sheet, 100, FRONT_ROW)).toBeCloseTo(
                6 * (200 / 60) * 1.5 * ROW_FALLOFF[FRONT_ROW],
                2,
            );
        });

        it('smooths the analyser by at least the band minimum, whatever the setting', () => {
            const bass = createHarness();
            const bassSheet = new TrioColorWaveSheet(BANDS[2], 2, SHEET_COUNT);
            bassSheet.connect(asWebAudio<AnalyserNode>(bass.source));
            const tap = bass.tap();

            bassSheet.update({ ...values, smoothing: 0 });
            expect(tap.smoothingTimeConstant).toBe(BANDS[2].minSmoothing);
            bassSheet.update({ ...values, smoothing: 0.9 });
            expect(tap.smoothingTimeConstant).toBe(0.9);
        });

        it('flags the height buffer for upload', () => {
            harness.sheet.connect(asWebAudio<AnalyserNode>(harness.source));
            const version = harness.sheet.flags.heightAttribute.version;
            harness.sheet.update(values);
            expect(harness.sheet.flags.heightAttribute.version).toBeGreaterThan(version);
        });

        it('sizes its spectrum buffer from the analyser it connected to', () => {
            harness.sheet.connect(asWebAudio<AnalyserNode>(harness.source));
            harness.sheet.update(values);
            const read = harness.tap().getByteFrequencyData.mock.calls[0][0];
            expect(read).toHaveLength(BANDS[0].fftSize / 2);
        });
    });

    describe('construction and disposal', () => {
        it('gives every row the configured tip length', () => {
            const tips = harness.sheet.flags.geometry.getAttribute('instanceTip');
            expect(tips.getX(0)).toBe(26);
            expect(tips.getX(tips.count - 1)).toBe(26);
        });

        it('disconnects and frees its mesh on dispose', () => {
            harness.sheet.connect(asWebAudio<AnalyserNode>(harness.source));
            const tap = harness.tap();
            const flags = vi.spyOn(harness.sheet.flags, 'dispose');
            harness.sheet.dispose();
            expect(tap.disconnect).toHaveBeenCalled();
            expect(flags).toHaveBeenCalledTimes(1);
        });
    });
});

// Golden record of TrioColorWaveSheet.update over a fixed, deterministic spectrum sequence, taken before the band
// helpers moved to the shared module. Every row is [peak, frameLevel, balancedLevel, sum of all bar heights, the
// nearest row's height at column 100]; a refactor of the maths must reproduce it exactly.
describe('TrioColorWaveSheet golden output', () => {
    const FRAMES = 14;

    // Ten significant digits: far tighter than any change in the maths could hide in, and exactly writable as literals.
    const roundRow = (row: number[]) => row.map((value) => Number(value.toPrecision(10)));

    // A small linear congruential generator, so the spectra never change between runs.
    function recordSheet(bandIndex: number, sheetIndex: number): number[][] {
        let seed = 12345 + bandIndex;
        const random = () => {
            seed = (seed * 1664525 + 1013904223) % 4294967296;
            return seed / 4294967296;
        };
        const context = new FakeAudioContext();
        const source = context.createAnalyser();
        const sheet = new TrioColorWaveSheet(BANDS[bandIndex], sheetIndex, SHEET_COUNT);
        sheet.connect(asWebAudio<AnalyserNode>(source));
        const tap = context.createdAnalysers[context.createdAnalysers.length - 1];
        const rows: number[][] = [];
        for (let frame = 0; frame < FRAMES; frame++) {
            // Loud, quiet and silent frames in turn, so the peak both rises and decays.
            const loudness = [1, 0.2, 0, 0.6][frame % 4];
            const data = new Array<number>(tap.frequencyBinCount);
            for (let bin = 0; bin < data.length; bin++) {
                data[bin] = Math.floor(random() * 256 * loudness * (1 - bin / (data.length * 1.5)));
            }
            tap.setByteFrequencyData(data);
            sheet.update(values);
            const heights = sheet.flags.heightAttribute.array;
            let total = 0;
            for (const height of heights) {
                total += height;
            }
            rows.push([sheet.peak, sheet.frameLevel, sheet.balancedLevel, total, heightOf(sheet, 100, FRONT_ROW)]);
        }
        return rows;
    }

    it.each([0, 1, 2])('reproduces the recorded output for band %i', (bandIndex) => {
        expect(recordSheet(bandIndex, bandIndex).map(roundRow)).toEqual(GOLDEN[bandIndex]);
    });
});

describe('createSheetColors', () => {
    const width = 4;
    const depth = 2;

    function hueOf(colors: THREE.Color[], column: number, row: number): number {
        return colors[column * depth + row].getHSL({ h: 0, s: 0, l: 0 }).h;
    }

    it('makes one colour per flag', () => {
        expect(createSheetColors(0, 1, width, depth)).toHaveLength(width * depth);
    });

    it('runs from the start hue at the first flag to the end hue at the last', () => {
        const colors = createSheetColors(0.1, 0.5, width, depth);
        expect(hueOf(colors, 0, 0)).toBeCloseTo(0.1, 3);
        // Odd rows are walked right to left, so the last flag of an even row count ends in column 0.
        expect(hueOf(colors, 0, depth - 1)).toBeCloseTo(0.5, 3);
    });

    it('snakes along the sheet: the hue continues smoothly at the end of each row', () => {
        const colors = createSheetColors(0, 0.7, width, depth);
        const step = 0.7 / (width * depth - 1);
        expect(hueOf(colors, 1, 0) - hueOf(colors, 0, 0)).toBeCloseTo(step, 3);
        expect(hueOf(colors, width - 1, 1) - hueOf(colors, width - 1, 0)).toBeCloseTo(step, 3);
        expect(hueOf(colors, width - 2, 1) - hueOf(colors, width - 1, 1)).toBeCloseTo(step, 3);
    });

    it('uses a saturated, mid-light colour', () => {
        const hsl = createSheetColors(0, 1, width, depth)[0].getHSL({ h: 0, s: 0, l: 0 });
        expect(hsl.s).toBeCloseTo(0.85, 2);
        expect(hsl.l).toBeCloseTo(0.55, 2);
    });
});
