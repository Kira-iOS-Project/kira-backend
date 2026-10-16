/**
 * Unduh Datamu (AKN-04c): every transaction as a CSV a person opens in a spreadsheet. The file is
 * read by people, so its header and its words are Indonesian, the same words the app shows; dates
 * and times are WIB, amounts whole rupiah without separators so a spreadsheet sums them.
 */

import {
  EXPENSE_CATEGORY,
  INCOME_CATEGORY,
  TRANSACTION_SOURCE,
  TRANSACTION_TYPE,
} from '../../lib/constants/money.ts';
import { wibDate } from '../../lib/time/wib.ts';
import type { ExportRow } from './account.repository.ts';

const HEADER = ['Tanggal', 'Jam', 'Jenis', 'Kategori', 'Nama', 'Nominal', 'Sumber', 'Catatan'];

const TYPE_LABEL: Record<ExportRow['type'], string> = {
  [TRANSACTION_TYPE.expense]: 'Pengeluaran',
  [TRANSACTION_TYPE.income]: 'Pemasukan',
};

/** CatatManual's tiles and the Riwayat chips. */
const CATEGORY_LABEL: Record<ExportRow['category'], string> = {
  [EXPENSE_CATEGORY.food]: 'Makan',
  [EXPENSE_CATEGORY.coffee]: 'Kopi',
  [EXPENSE_CATEGORY.transport]: 'Transportasi',
  [EXPENSE_CATEGORY.shopping]: 'Belanja',
  [EXPENSE_CATEGORY.bills]: 'Tagihan',
  [EXPENSE_CATEGORY.paylaterInstalment]: 'Paylater',
  [EXPENSE_CATEGORY.savingsDeposit]: 'Tabungan',
  [EXPENSE_CATEGORY.insurance]: 'Proteksi',
  [EXPENSE_CATEGORY.entertainment]: 'Hiburan',
  [EXPENSE_CATEGORY.health]: 'Kesehatan',
  [EXPENSE_CATEGORY.education]: 'Pendidikan',
  [EXPENSE_CATEGORY.household]: 'Rumah Tangga',
  [EXPENSE_CATEGORY.otherExpense]: 'Lainnya',
  [INCOME_CATEGORY.salary]: 'Gaji',
  [INCOME_CATEGORY.bonus]: 'Bonus',
  [INCOME_CATEGORY.business]: 'Usaha',
  [INCOME_CATEGORY.otherIncome]: 'Lainnya',
};

/** Riwayat's row subtitle: dari chat, manual, struk, impor. */
const SOURCE_LABEL: Record<ExportRow['source'], string> = {
  [TRANSACTION_SOURCE.chat]: 'Chat',
  [TRANSACTION_SOURCE.manual]: 'Manual',
  [TRANSACTION_SOURCE.receipt]: 'Struk',
  [TRANSACTION_SOURCE.bankImport]: 'Impor',
};

const WIB_OFFSET_MS = 7 * 60 * 60 * 1000;

/** "12.41", the WIB clock time the app writes. */
export function wibTime(instant: Date): string {
  return new Date(instant.getTime() + WIB_OFFSET_MS).toISOString().slice(11, 16).replace(':', '.');
}

/**
 * One RFC 4180 field. A text that a spreadsheet would run as a formula (=, +, -, @) is opened with
 * an apostrophe, so a transaction name can never execute in the person's spreadsheet.
 */
function field(value: string): string {
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return /[",\r\n]/.test(safe) ? `"${safe.replaceAll('"', '""')}"` : safe;
}

/** `kira-data-2026-10-16.csv`, dated the WIB day it was made. */
export function exportFileName(now: Date): string {
  return `kira-data-${wibDate(now)}.csv`;
}

/** The whole file, with a byte-order mark so a spreadsheet reads it as UTF-8. */
export function transactionsCsv(rows: readonly ExportRow[]): string {
  const lines = rows.map((row) =>
    [
      wibDate(row.occurredAt),
      wibTime(row.occurredAt),
      TYPE_LABEL[row.type],
      CATEGORY_LABEL[row.category],
      field(row.name),
      String(row.amount),
      SOURCE_LABEL[row.source],
      field(row.note ?? ''),
    ].join(','),
  );
  return `﻿${[HEADER.join(','), ...lines].join('\r\n')}\r\n`;
}
