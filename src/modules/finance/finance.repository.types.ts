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

type CreateWalletBody = {
  name: string;
  type: Values<typeof WALLET_TYPE>;
  openingBalance: number;
};

type CreateDebtBody = {
  name: string;
  kind: Values<typeof DEBT_KIND>;
  amount: number;
  monthlyInstallment: number;
  remainingTenorMonths: number | null;
  dueDay: number | null;
};

export type FinanceRepository = {
  listWallets(userId: string): Promise<WalletRow[]>;
  createWallet(userId: string, body: CreateWalletBody, now: Date): Promise<WalletRow>;
  /** The open accounts; with `includePaidOff`, every account (Unduh Datamu). */
  listDebts(userId: string, options?: { includePaidOff: boolean }): Promise<DebtRow[]>;
  createDebt(userId: string, body: CreateDebtBody, now: Date): Promise<DebtRow>;
};
