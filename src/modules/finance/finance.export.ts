/**
 * Dompet's part of the data export: the wallets and the debt accounts (the health check's and those
 * added in Dompet), worded like the rest of Unduh Datamu (Title Case Indonesian headers, the
 * labels people read, whole rupiah). The budget's block is its own.
 */

import { DEBT_KIND, DEBT_PAYMENT_STATUS } from '../../lib/constants/profile.ts';
import { WALLET_TYPE } from '../../lib/constants/ung.ts';
import type { ExportSection } from '../../lib/export/export-section.ts';
import { wibDate } from '../../lib/time/wib.ts';
import { financeRepository, type FinanceRepository } from './finance.repository.ts';

type Values<T> = T[keyof T];

/** Tambah Dompet's tiles. */
const WALLET_TYPE_LABEL: Record<Values<typeof WALLET_TYPE>, string> = {
  [WALLET_TYPE.bank]: 'Bank',
  [WALLET_TYPE.eWallet]: 'E-Wallet',
  [WALLET_TYPE.cash]: 'Tunai',
  [WALLET_TYPE.other]: 'Lainnya',
};

/** The health check's debt kinds. */
const DEBT_KIND_LABEL: Record<Values<typeof DEBT_KIND>, string> = {
  [DEBT_KIND.paylater]: 'Paylater',
  [DEBT_KIND.onlineLoan]: 'Pinjol',
  [DEBT_KIND.creditCard]: 'Kartu Kredit',
  [DEBT_KIND.vehicle]: 'Cicilan Kendaraan',
  [DEBT_KIND.mortgage]: 'KPR',
  [DEBT_KIND.familyLoan]: 'Pinjaman Keluarga',
};

const PAYMENT_STATUS_LABEL: Record<Values<typeof DEBT_PAYMENT_STATUS>, string> = {
  [DEBT_PAYMENT_STATUS.onTime]: 'Tepat Waktu',
  [DEBT_PAYMENT_STATUS.late]: 'Terlambat',
  [DEBT_PAYMENT_STATUS.overdue]: 'Menunggak',
};

/** An empty cell for a figure the account does not have. */
const cell = (value: number | null) => (value === null ? '' : String(value));

/** The sections with something in them: the wallets, then the debt accounts. */
export async function financeExportSections(
  userId: string,
  deps: { repository?: FinanceRepository } = {},
): Promise<ExportSection[]> {
  const repository = deps.repository ?? financeRepository;
  const [wallets, debts] = await Promise.all([
    repository.listWallets(userId),
    repository.listDebts(userId, { includePaidOff: true }),
  ]);
  const sections: ExportSection[] = [];
  if (wallets.length > 0) {
    sections.push({
      title: 'Dompet',
      header: ['Nama', 'Jenis', 'Saldo Awal', 'Tanggal Dibuat'],
      rows: wallets.map((wallet) => [
        wallet.name,
        WALLET_TYPE_LABEL[wallet.type],
        String(wallet.balance),
        wibDate(wallet.createdAt),
      ]),
    });
  }
  if (debts.length > 0) {
    sections.push({
      title: 'Dompet · Akun Utang',
      header: [
        'Nama',
        'Jenis',
        'Jumlah Awal',
        'Sisa',
        'Cicilan per Bulan',
        'Sisa Tenor',
        'Jatuh Tempo',
        'Status',
      ],
      rows: debts.map((debt) => [
        debt.name,
        DEBT_KIND_LABEL[debt.kind],
        String(debt.originalAmount),
        String(debt.remainingAmount),
        String(debt.monthlyInstallment),
        cell(debt.remainingTenorMonths),
        cell(debt.dueDay),
        PAYMENT_STATUS_LABEL[debt.paymentStatus],
      ]),
    });
  }
  return sections;
}
