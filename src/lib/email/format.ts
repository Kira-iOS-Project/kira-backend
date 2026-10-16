/**
 * How an email writes money and dates, the way the app does: `Rp29.000,00` and `19 Oktober 2026`.
 * Emails are the only place the server writes Indonesian, so these live beside the layout.
 */

const MONTHS = [
  'Januari',
  'Februari',
  'Maret',
  'April',
  'Mei',
  'Juni',
  'Juli',
  'Agustus',
  'September',
  'Oktober',
  'November',
  'Desember',
] as const;

/** "2026-10-19" → "19 Oktober 2026". */
export function longDate(date: string): string {
  const [year = '', month = '1', day = '1'] = date.split('-');
  return `${Number(day)} ${MONTHS[Number(month) - 1] ?? ''} ${year}`;
}

/** 29000 → "Rp29.000,00". */
export function rupiah(amount: number): string {
  const grouped = String(Math.trunc(amount)).replaceAll(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `Rp${grouped},00`;
}
