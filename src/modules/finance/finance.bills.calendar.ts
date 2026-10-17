/**
 * When a bill falls due, in WIB calendar days. A monthly bill comes back on its first due date's
 * day (the 31st becomes a short month's last day), a yearly one on its day and month, a one-off
 * once. The current occurrence is the first one from the start of this month (this month's for a
 * monthly bill, the coming one for a yearly bill), or the first due date while that is still
 * ahead. It counts as paid when the last payment came after the occurrence before it; then the
 * next one is due.
 */

import { BILL_GROUP, BILL_REPEAT, BILL_SOON_DAYS } from '../../lib/constants/ung.ts';
import { addMonths, daysBetween } from '../../lib/time/wib.ts';

type Repeat = (typeof BILL_REPEAT)[keyof typeof BILL_REPEAT];
type Group = (typeof BILL_GROUP)[keyof typeof BILL_GROUP];

export type BillDue = { nextDueOn: string | null; daysUntil: number | null; paid: boolean };

const monthIndex = (date: string) => Number(date.slice(0, 4)) * 12 + Number(date.slice(5, 7)) - 1;

/** How many periods after `dueOn` the first occurrence from this month on is; 0 before it. */
function periodsSince(dueOn: string, today: string, repeats: Repeat): number {
  const months = monthIndex(today) - monthIndex(dueOn);
  if (months <= 0) return 0;
  return repeats === BILL_REPEAT.yearly ? Math.ceil(months / 12) : months;
}

/** The occurrence `k` periods after the first due date, always counted from it. */
function occurrence(dueOn: string, repeats: Repeat, k: number): string {
  return addMonths(dueOn, repeats === BILL_REPEAT.yearly ? 12 * k : k);
}

/**
 * The bill's next due date from today and its last payment (marked, or of its linked debt):
 * `paid` when that payment covers the current occurrence.
 */
export function billDue(
  dueOn: string,
  repeats: Repeat,
  lastPaidOn: string | null,
  today: string,
): BillDue {
  if (repeats === BILL_REPEAT.once) {
    const paid = lastPaidOn !== null;
    const nextDueOn = paid ? null : dueOn;
    return { nextDueOn, daysUntil: nextDueOn ? daysBetween(today, nextDueOn) : null, paid };
  }
  const k = periodsSince(dueOn, today, repeats);
  const previous = k > 0 ? occurrence(dueOn, repeats, k - 1) : null;
  const paid = lastPaidOn !== null && (previous === null || lastPaidOn > previous);
  const nextDueOn = occurrence(dueOn, repeats, paid ? k + 1 : k);
  return { nextDueOn, daysUntil: daysBetween(today, nextDueOn), paid };
}

/** The board's section for a due date: soon (overdue included), this month, next month, later. */
export function billGroup(nextDueOn: string, today: string): Group {
  if (daysBetween(today, nextDueOn) <= BILL_SOON_DAYS) return BILL_GROUP.next7Days;
  const months = monthIndex(nextDueOn) - monthIndex(today);
  if (months === 0) return BILL_GROUP.thisMonth;
  return months === 1 ? BILL_GROUP.nextMonth : BILL_GROUP.later;
}

/** What the bill costs a month: a twelfth of a yearly one, nothing for a one-off. */
export function monthlyShare(amount: number, repeats: Repeat): number {
  if (repeats === BILL_REPEAT.monthly) return amount;
  return repeats === BILL_REPEAT.yearly ? Math.round(amount / 12) : 0;
}

/** The later of two optional WIB days. */
export function laterDay(first: string | null, second: string | null): string | null {
  if (first === null) return second;
  if (second === null) return first;
  return first > second ? first : second;
}
