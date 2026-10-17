import type { DEBT_KIND, DEBT_PAYMENT_STATUS } from '../../lib/constants/profile.ts';
import type { BILL_REPEAT_INTERVAL, WALLET_TYPE } from '../../lib/constants/ung.ts';
import { expenseCategorySchema } from '../../lib/money/money.schema.ts';
import type { z } from 'zod';
import type { CreateBillBody, UpdateBillBody } from './finance.bills.schema.ts';

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

export type BillRow = {
  id: string;
  name: string;
  amount: number;
  category: z.infer<typeof expenseCategorySchema>;
  nextDueDate: string;
  repeatInterval: Values<typeof BILL_REPEAT_INTERVAL>;
  installmentsTotal: number | null;
  installmentsRemaining: number | null;
  linkedDebtAccountId: string | null;
  linkedDebtName: string | null;
  paidThisPeriod: boolean;
};

export type FinanceRepository = {
  listWallets(userId: string): Promise<WalletRow[]>;
  listDebts(userId: string): Promise<DebtRow[]>;
  listBills(userId: string, periodStart: string): Promise<BillRow[]>;
  createBill(userId: string, body: CreateBillBody): Promise<BillRow | null>;
  getBill(userId: string, id: string): Promise<BillRow | null>;
  updateBill(userId: string, id: string, body: UpdateBillBody): Promise<BillRow | null>;
  deleteBill(userId: string, id: string): Promise<boolean>;
};
