/**
 * Moving an instant by calendar months in WIB: a plan bought at 12.10 WIB on 31 January renews at
 * 12.10 WIB on 28 February. The date moves as `addMonths` moves it; the time of day stays.
 */

import { addMonths, daysBetween, wibDate } from './wib.ts';

const DAY_MS = 24 * 60 * 60 * 1000;

export function addMonthsToInstant(instant: Date, months: number): Date {
  const from = wibDate(instant);
  return new Date(instant.getTime() + daysBetween(from, addMonths(from, months)) * DAY_MS);
}
