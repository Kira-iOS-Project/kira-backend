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
