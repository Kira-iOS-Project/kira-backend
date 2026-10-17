/** Wallet values accepted by the UNG account overview. */
export const WALLET_TYPE = {
  cash: 'cash',
  bank: 'bank',
  eWallet: 'e_wallet',
  other: 'other',
} as const;

export const BILL_REPEAT_INTERVAL = {
  weekly: 'weekly',
  monthly: 'monthly',
  yearly: 'yearly',
} as const;

export const BILL_KIND = {
  bill: 'bill',
  debtInstallment: 'debtInstallment',
} as const;

export const INDONESIAN_WEEKLY_NOTE = {
  spentMore: 'Pengeluaran minggu ini lebih tinggi daripada minggu lalu.',
  spentLess: 'Pengeluaran minggu ini lebih rendah daripada minggu lalu.',
  spentSame: 'Pengeluaran minggu ini sama dengan minggu lalu.',
  firstWeek: 'Kamu sudah mulai mencatat keuangan minggu ini.',
} as const;
