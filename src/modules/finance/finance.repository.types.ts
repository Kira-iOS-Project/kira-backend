import type { DEBT_KIND, DEBT_PAYMENT_STATUS } from '../../lib/constants/profile.ts';
import type { WALLET_TYPE } from '../../lib/constants/ung.ts';

type Values<T> = T[keyof T];

type WalletRow = {
  id: string;
  name: string;
  type: Values<typeof WALLET_TYPE>;
  balance: number;
  createdAt: Date;
};

type DebtRow = {
  id: string;
  name: string;
  kind: Values<typeof DEBT_KIND>;
  originalAmount: number;
  remainingAmount: number;
  monthlyInstallment: number;
  remainingTenorMonths: number | null;
  dueDay: number | null;
  paymentStatus: Values<typeof DEBT_PAYMENT_STATUS>;
};

export type FinanceRepository = {
  listWallets(userId: string): Promise<WalletRow[]>;
  listDebts(userId: string): Promise<DebtRow[]>;
};
