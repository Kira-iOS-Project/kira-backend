/**
 * The words of a transaction: its direction, its category and where it was recorded from. The
 * categories are a fixed list the app draws with the design system's category tiles; the API
 * stores and validates the ids, the app names them.
 */

export const TRANSACTION_TYPE = {
  expense: 'expense',
  income: 'income',
} as const;

/** CatatManual's expense grid, the Riwayat filter chips and the draft sheet's chips. */
export const EXPENSE_CATEGORY = {
  food: 'food',
  coffee: 'coffee',
  transport: 'transport',
  shopping: 'shopping',
  bills: 'bills',
  paylaterInstalment: 'paylater_instalment',
  savingsDeposit: 'savings_deposit',
  insurance: 'insurance',
  entertainment: 'entertainment',
  health: 'health',
  education: 'education',
  household: 'household',
  otherExpense: 'other_expense',
} as const;

/** CatatManualPemasukan: Gaji, Bonus, Usaha, Lainnya. */
export const INCOME_CATEGORY = {
  salary: 'salary',
  bonus: 'bonus',
  business: 'business',
  otherIncome: 'other_income',
} as const;

/** Riwayat's row subtitle: dari chat, manual, struk, impor. */
export const TRANSACTION_SOURCE = {
  chat: 'chat',
  manual: 'manual',
  receipt: 'receipt',
  bankImport: 'bank_import',
} as const;
