import { describe, expect, test } from 'bun:test';
import { BILL_GROUP, BILL_REPEAT } from '../../../lib/constants/ung.ts';
import { billDue, billGroup, laterDay, monthlyShare } from '../finance.bills.calendar.ts';

const TODAY = '2026-10-17';

describe('billDue', () => {
  test('a monthly bill is due on its day this month, overdue when that day has passed', () => {
    expect(billDue('2026-09-22', BILL_REPEAT.monthly, null, TODAY)).toEqual({
      nextDueOn: '2026-10-22',
      daysUntil: 5,
      paid: false,
    });
    expect(billDue('2026-08-10', BILL_REPEAT.monthly, null, TODAY)).toMatchObject({
      nextDueOn: '2026-10-10',
      daysUntil: -7,
    });
  });

  test('a payment after the previous occurrence moves it to the next one', () => {
    expect(billDue('2026-09-20', BILL_REPEAT.monthly, '2026-10-16', TODAY)).toEqual({
      nextDueOn: '2026-11-20',
      daysUntil: 34,
      paid: true,
    });
    expect(billDue('2026-09-20', BILL_REPEAT.monthly, '2026-09-20', TODAY).paid).toBe(false);
  });

  test('a bill whose first due date is ahead waits for it, any payment covering it', () => {
    expect(billDue('2026-12-05', BILL_REPEAT.monthly, null, TODAY).nextDueOn).toBe('2026-12-05');
    expect(billDue('2026-12-05', BILL_REPEAT.monthly, '2026-10-01', TODAY).nextDueOn).toBe(
      '2027-01-05',
    );
  });

  test("the 31st falls on a short month's last day, counted from the first due date", () => {
    expect(billDue('2026-01-31', BILL_REPEAT.monthly, null, '2026-11-02').nextDueOn).toBe(
      '2026-11-30',
    );
    expect(billDue('2026-01-31', BILL_REPEAT.monthly, null, TODAY).nextDueOn).toBe('2026-10-31');
  });

  test('a yearly bill is due on the coming occurrence of its day and month', () => {
    expect(billDue('2025-12-01', BILL_REPEAT.yearly, null, TODAY)).toMatchObject({
      nextDueOn: '2026-12-01',
      daysUntil: 45,
    });
    expect(billDue('2025-10-05', BILL_REPEAT.yearly, null, TODAY).nextDueOn).toBe('2026-10-05');
    expect(billDue('2025-10-05', BILL_REPEAT.yearly, '2026-09-01', TODAY).nextDueOn).toBe(
      '2027-10-05',
    );
  });

  test('a one-off bill is due once, and done when paid', () => {
    expect(billDue('2026-10-30', BILL_REPEAT.once, null, TODAY)).toEqual({
      nextDueOn: '2026-10-30',
      daysUntil: 13,
      paid: false,
    });
    expect(billDue('2026-10-30', BILL_REPEAT.once, TODAY, TODAY)).toEqual({
      nextDueOn: null,
      daysUntil: null,
      paid: true,
    });
  });
});

describe('billGroup', () => {
  test("sorts a due date into the board's sections", () => {
    expect(billGroup('2026-10-10', TODAY)).toBe(BILL_GROUP.next7Days);
    expect(billGroup('2026-10-24', TODAY)).toBe(BILL_GROUP.next7Days);
    expect(billGroup('2026-10-28', TODAY)).toBe(BILL_GROUP.thisMonth);
    expect(billGroup('2026-11-20', TODAY)).toBe(BILL_GROUP.nextMonth);
    expect(billGroup('2026-12-01', TODAY)).toBe(BILL_GROUP.later);
  });
});

describe('monthlyShare and laterDay', () => {
  test('a month of each repeat, and the later of two days', () => {
    expect(monthlyShare(350_000, BILL_REPEAT.monthly)).toBe(350_000);
    expect(monthlyShare(1_200_005, BILL_REPEAT.yearly)).toBe(100_000);
    expect(monthlyShare(500_000, BILL_REPEAT.once)).toBe(0);
    expect(laterDay(null, '2026-10-01')).toBe('2026-10-01');
    expect(laterDay('2026-10-01', null)).toBe('2026-10-01');
    expect(laterDay('2026-10-02', '2026-10-01')).toBe('2026-10-02');
    expect(laterDay('2026-10-01', '2026-10-02')).toBe('2026-10-02');
  });
});
