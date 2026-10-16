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
