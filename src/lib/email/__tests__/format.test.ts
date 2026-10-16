import { describe, expect, test } from 'bun:test';
import { longDate, rupiah } from '../format.ts';

describe('longDate', () => {
  test('writes the day, the Indonesian month and the year', () => {
    expect(longDate('2026-10-19')).toBe('19 Oktober 2026');
    expect(longDate('2027-01-05')).toBe('5 Januari 2027');
    expect(longDate('2026-12-31')).toBe('31 Desember 2026');
  });
});

describe('rupiah', () => {
  test('groups thousands with dots and ends with ,00', () => {
    expect(rupiah(29_000)).toBe('Rp29.000,00');
    expect(rupiah(290_000)).toBe('Rp290.000,00');
    expect(rupiah(1_250_000)).toBe('Rp1.250.000,00');
    expect(rupiah(0)).toBe('Rp0,00');
  });
});
