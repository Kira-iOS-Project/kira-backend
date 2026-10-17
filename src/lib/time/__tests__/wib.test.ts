import { describe, expect, test } from 'bun:test';
import {
  addDays,
  addMonths,
  daysBetween,
  daysInMonth,
  monthStart,
  nextThursdayAt0600Wib,
  paydayPeriod,
  wibDate,
  wibStartOfDay,
  wibTime,
} from '../wib.ts';

describe('wibDate', () => {
  test('is already the next day in Jakarta at 17:00 UTC', () => {
    expect(wibDate(new Date('2026-10-15T16:59:59Z'))).toBe('2026-10-15');
    expect(wibDate(new Date('2026-10-15T17:00:00Z'))).toBe('2026-10-16');
  });
});

describe('wibTime', () => {
  test('writes the WIB clock as the app does', () => {
    expect(wibTime(new Date('2026-10-17T05:41:00.000Z'))).toBe('12.41');
    expect(wibTime(new Date('2026-10-16T17:05:00.000Z'))).toBe('00.05');
  });
});

describe('nextThursdayAt0600Wib', () => {
  test('uses the upcoming Thursday at 06:00 WIB and advances from the deadline', () => {
    expect(nextThursdayAt0600Wib(new Date('2026-10-14T22:59:59.000Z')).toISOString()).toBe(
      '2026-10-14T23:00:00.000Z',
    );
    expect(nextThursdayAt0600Wib(new Date('2026-10-14T23:00:00.000Z')).toISOString()).toBe(
      '2026-10-21T23:00:00.000Z',
    );
    expect(nextThursdayAt0600Wib(new Date('2026-10-16T05:00:00.000Z')).toISOString()).toBe(
      '2026-10-21T23:00:00.000Z',
    );
  });
});

describe('wibStartOfDay', () => {
  test('is 17:00 UTC of the day before', () => {
    expect(wibStartOfDay('2026-10-16').toISOString()).toBe('2026-10-15T17:00:00.000Z');
  });
});

describe('day arithmetic', () => {
  test('adds days across a month end', () => {
    expect(addDays('2026-10-30', 3)).toBe('2026-11-02');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });

  test('counts the days between two dates', () => {
    expect(daysBetween('2026-10-15', '2026-10-25')).toBe(10);
    expect(daysBetween('2026-10-25', '2026-10-15')).toBe(-10);
  });

  test('knows February in leap and common years', () => {
    expect(daysInMonth(2028, 2)).toBe(29);
    expect(daysInMonth(2026, 2)).toBe(28);
  });

  test('adds months, pulling the day back to a shorter month end', () => {
    expect(addMonths('2026-01-31', 1)).toBe('2026-02-28');
    expect(addMonths('2026-12-15', 1)).toBe('2027-01-15');
    expect(addMonths('2026-01-15', -1)).toBe('2025-12-15');
    expect(addMonths('2026-10-16', 12)).toBe('2027-10-16');
  });

  test('finds the first of the month', () => {
    expect(monthStart('2026-10-15')).toBe('2026-10-01');
  });
});

describe('paydayPeriod', () => {
  test('runs from the last payday to the day before the next (the canvas example)', () => {
    expect(paydayPeriod('2026-10-15', { day: 25, endOfMonth: false })).toEqual({
      start: '2026-09-25',
      end: '2026-10-24',
      nextPayday: '2026-10-25',
      daysUntilPayday: 10,
    });
  });

  test('starts on payday itself', () => {
    expect(paydayPeriod('2026-10-25', { day: 25, endOfMonth: false }).start).toBe('2026-10-25');
  });

  test('falls on the last day of a short month', () => {
    expect(paydayPeriod('2026-02-28', { day: 31, endOfMonth: false })).toEqual({
      start: '2026-02-28',
      end: '2026-03-30',
      nextPayday: '2026-03-31',
      daysUntilPayday: 31,
    });
  });

  test('uses the last day of every month, February included, when paid at month end', () => {
    expect(paydayPeriod('2026-02-10', { day: null, endOfMonth: true })).toEqual({
      start: '2026-01-31',
      end: '2026-02-27',
      nextPayday: '2026-02-28',
      daysUntilPayday: 18,
    });
  });

  test('is the calendar month without a payday', () => {
    expect(paydayPeriod('2026-10-15', { day: null, endOfMonth: false })).toEqual({
      start: '2026-10-01',
      end: '2026-10-31',
      nextPayday: '2026-11-01',
      daysUntilPayday: 17,
    });
  });

  test('crosses a year end', () => {
    expect(paydayPeriod('2027-01-05', { day: 25, endOfMonth: false }).start).toBe('2026-12-25');
  });
});
