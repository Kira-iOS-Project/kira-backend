/**
 * Tagihan & Cicilan's part of the data export, worded like the rest of Unduh Datamu: Title Case
 * Indonesian headers, WIB days, whole rupiah, and the words people read instead of stored values.
 */

import { EXPENSE_CATEGORY } from '../../lib/constants/money.ts';
import { BILL_REPEAT } from '../../lib/constants/ung.ts';
import type { ExportSection } from '../../lib/export/export-section.ts';
import { billRepository, type BillRepository, type BillRow } from './finance.repository.bills.ts';

/** Tambah Tagihan's tiles and Catat's words for the other expense categories. */
const CATEGORY_LABEL: Record<BillRow['category'], string> = {
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
};

/** Ulangi's choices. */
const REPEAT_LABEL: Record<BillRow['repeats'], string> = {
  [BILL_REPEAT.once]: 'Sekali',
  [BILL_REPEAT.monthly]: 'Bulanan',
  [BILL_REPEAT.yearly]: 'Tahunan',
};

/** The bills block, or nothing without a bill. */
export async function billExportSections(
  userId: string,
  deps: { repository?: BillRepository } = {},
): Promise<ExportSection[]> {
  const rows = await (deps.repository ?? billRepository).listBills(userId);
  if (rows.length === 0) return [];
  return [
    {
      title: 'Uang · Tagihan',
      header: [
        'Nama',
        'Kategori',
        'Jumlah',
        'Perkiraan',
        'Ulangi',
        'Tanggal',
        'Cicilan Utang',
        'Terakhir Dibayar',
      ],
      rows: rows.map((row) => [
        row.name,
        CATEGORY_LABEL[row.category],
        String(row.amount),
        row.isEstimate ? 'Ya' : 'Tidak',
        REPEAT_LABEL[row.repeats],
        row.dueOn,
        row.debtId ? 'Ya' : 'Tidak',
        row.lastPaidOn ?? '',
      ]),
    },
  ];
}
