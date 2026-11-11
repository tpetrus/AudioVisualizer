import { describe, expect, it } from 'vitest';
import { formatCsv, parseCsv } from './csv';

describe('telemetry CSV', () => {
    it('writes NaN, Infinity and -Infinity each under their own name', () => {
        const csv = formatCsv(['a', 'b', 'c', 'd'], [1.5, NaN, Infinity, -Infinity], 1);
        expect(csv).toBe('a,b,c,d\n1.5,NaN,Infinity,-Infinity\n');
    });

    it('reads all three back as they were written', () => {
        const table = parseCsv(formatCsv(['a', 'b', 'c', 'd'], [1.5, NaN, Infinity, -Infinity], 1));
        expect(table.columns).toEqual(['a', 'b', 'c', 'd']);
        expect(table.rows[0][0]).toBe(1.5);
        expect(table.rows[0][1]).toBeNaN();
        expect(table.rows[0][2]).toBe(Infinity);
        expect(table.rows[0][3]).toBe(-Infinity);
    });

    it('reads an empty cell as NaN and rejects garbage, empty files and ragged rows', () => {
        expect(parseCsv('a,b\n1,\n').rows[0][1]).toBeNaN();
        expect(() => parseCsv('a,b\n1,x\n')).toThrow('not a number');
        expect(() => parseCsv('')).toThrow('empty');
        expect(() => parseCsv('a,\n1,2\n')).toThrow('empty column name');
        expect(() => parseCsv('a,b\n1\n')).toThrow('expected 2');
    });
});
