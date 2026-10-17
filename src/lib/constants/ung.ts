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
