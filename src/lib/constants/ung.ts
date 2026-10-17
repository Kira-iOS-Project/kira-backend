import { BILLING_PERIOD } from './plans.ts';

/** Wallet values accepted by the UNG account overview. */
export const WALLET_TYPE = {
  cash: 'cash',
  bank: 'bank',
  eWallet: 'e_wallet',
  other: 'other',
} as const;

/** Accepted input spellings that normalize to existing stored wallet/debt kinds. */
export const FINANCE_INPUT_ALIAS = {
  eWallet: 'ewallet',
  pinjol: 'pinjol',
} as const;

/** What POST /wallets created, the discriminator of its answer (a credit card is a debt account). */
export const FINANCE_ACCOUNT_TYPE = {
  wallet: 'wallet',
  debt: 'debt',
} as const;

/** Tambah Tagihan's Ulangi: Sekali, Bulanan, Tahunan (the plan's billing words, one home each). */
export const BILL_REPEAT = {
  once: 'once',
  monthly: BILLING_PERIOD.monthly,
  yearly: BILLING_PERIOD.yearly,
} as const;

/** A bill on its own, or the instalment of one of the person's debt accounts. */
export const BILL_KIND = {
  bill: 'bill',
  instalment: 'instalment',
} as const;

/** Tagihan & Cicilan's sections: 7 Hari ke Depan, Bulan Ini, Bulan Depan, and later in the year. */
export const BILL_GROUP = {
  next7Days: 'next7Days',
  thisMonth: 'thisMonth',
  nextMonth: 'nextMonth',
  later: 'later',
} as const;

/** "7 Hari ke Depan": due within this many days, overdue included. */
export const BILL_SOON_DAYS = 7;

/** "Nama": at most this many characters. */
export const BILL_NAME_MAX = 60;

/** The most bills one person keeps (each list answers at most this many). */
export const BILL_LIST_LIMIT = 100;
