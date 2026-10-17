/**
 * Calendar arithmetic in Western Indonesian Time (UTC+7, no daylight saving), where every Kira
 * date lives: "today", a payday period, the 1st of the month a quota refills on. Dates travel as
 * `YYYY-MM-DD` strings so no time zone can shift them; an instant becomes one only through
 * `wibDate`.
 */

const WIB_OFFSET_MS = 7 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

/** The WIB calendar date of an instant. */
export function wibDate(instant: Date): string {
  return new Date(instant.getTime() + WIB_OFFSET_MS).toISOString().slice(0, 10);
}

/** "12.41", the WIB clock time the app writes. */
export function wibTime(instant: Date): string {
  return new Date(instant.getTime() + WIB_OFFSET_MS).toISOString().slice(11, 16).replace(':', '.');
}

/** The instant a WIB calendar date begins. */
export function wibStartOfDay(date: string): Date {
  return new Date(Date.parse(`${date}T00:00:00Z`) - WIB_OFFSET_MS);
}

export function addDays(date: string, days: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);
}

/** Whole days from `from` to `to`; negative when `to` comes first. */
export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS);
}

/** The number of days in a month; `month` counts from 1. */
export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** The same day `months` later, pulled back to the month's last day when it has fewer days. */
export function addMonths(date: string, months: number): string {
  const [year = 0, month = 1, day = 1] = date.split('-').map(Number);
  const index = year * 12 + (month - 1) + months;
  const targetYear = Math.floor(index / 12);
  const targetMonth = (index % 12) + 1;
  const targetDay = Math.min(day, daysInMonth(targetYear, targetMonth));
  return `${targetYear}-${String(targetMonth).padStart(2, '0')}-${String(targetDay).padStart(2, '0')}`;
}

export function monthStart(date: string): string {
  return `${date.slice(0, 7)}-01`;
}

/** Tanggal gajian: a day of the month, the last day of each month, or not answered yet. */
export type Payday = { day: number | null; endOfMonth: boolean };

export type PaydayPeriod = {
  /** The payday this period began on. */
  start: string;
  /** The day before the next payday. */
  end: string;
  nextPayday: string;
  /** "Sisa uang · gajian 10 hari lagi". */
  daysUntilPayday: number;
};

/** The payday that falls in the month of `date`. */
function paydayIn(date: string, payday: Payday): string {
  const [year = 0, month = 1] = date.split('-').map(Number);
  const last = daysInMonth(year, month);
  const day = payday.endOfMonth ? last : Math.min(payday.day ?? 1, last);
  return `${date.slice(0, 7)}-${String(day).padStart(2, '0')}`;
}

/**
 * The budget period `today` falls in: from the latest payday on or before it to the day before the
 * next one ("25 September – 24 Oktober"). Without a payday the period is the calendar month, and a
 * payday past a short month's end falls on its last day, February included.
 */
export function paydayPeriod(today: string, payday: Payday): PaydayPeriod {
  const thisMonth = paydayIn(today, payday);
  const start = thisMonth <= today ? thisMonth : paydayIn(addMonths(monthStart(today), -1), payday);
  const nextPayday = paydayIn(addMonths(monthStart(start), 1), payday);
  return {
    start,
    end: addDays(nextPayday, -1),
    nextPayday,
    daysUntilPayday: daysBetween(today, nextPayday),
  };
}
