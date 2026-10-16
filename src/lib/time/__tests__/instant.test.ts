import { describe, expect, test } from 'bun:test';
import { addMonthsToInstant } from '../instant.ts';

describe('addMonthsToInstant', () => {
  test('keeps the time of day and moves the WIB date by whole months', () => {
    expect(addMonthsToInstant(new Date('2026-10-16T05:10:00.000Z'), 1).toISOString()).toBe(
      '2026-11-16T05:10:00.000Z',
    );
    expect(addMonthsToInstant(new Date('2026-10-16T05:10:00.000Z'), 12).toISOString()).toBe(
      '2027-10-16T05:10:00.000Z',
    );
  });

  test('pulls a 31st back to the short month’s last day, in WIB', () => {
    /** 31 January 2027, 06.00 WIB. */
    expect(addMonthsToInstant(new Date('2027-01-30T23:00:00.000Z'), 1).toISOString()).toBe(
      '2027-02-27T23:00:00.000Z',
    );
  });
});
