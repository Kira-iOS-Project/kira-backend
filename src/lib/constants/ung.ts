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
