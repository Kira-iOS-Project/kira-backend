/**
 * Detail Utang's data access: one of the person's debt accounts and the payments marked against it,
 * both scoped to the owner.
 */

import { and, desc, eq } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { db } from '../../db/client/index.ts';
import { debtAccounts, debtPayments } from '../../db/schema/schema.ts';
import type { DEBT_KIND, DEBT_PAYMENT_STATUS } from '../../lib/constants/profile.ts';

type Values<T> = T[keyof T];

export type DebtAccountRow = {
  id: string;
  name: string;
  kind: Values<typeof DEBT_KIND>;
  originalAmount: number;
  remainingAmount: number;
  monthlyInstalment: number;
  remainingTenorMonths: number | null;
  dueDay: number | null;
  paymentStatus: Values<typeof DEBT_PAYMENT_STATUS>;
};

export type DebtPaymentRow = { id: string; amount: number; paidAt: Date };

export type DebtDetailRepository = {
  findDebt(userId: string, debtId: string): Promise<DebtAccountRow | null>;
  /** Newest first. */
  listPayments(userId: string, debtId: string): Promise<DebtPaymentRow[]>;
};

export function createDebtDetailRepository(client: PostgresJsDatabase = db): DebtDetailRepository {
  return {
    async findDebt(userId, debtId) {
      const [row] = await client
        .select({
          id: debtAccounts.id,
          name: debtAccounts.name,
          kind: debtAccounts.kind,
          originalAmount: debtAccounts.originalAmount,
          remainingAmount: debtAccounts.remainingAmount,
          monthlyInstalment: debtAccounts.monthlyInstalment,
          remainingTenorMonths: debtAccounts.remainingTenorMonths,
          dueDay: debtAccounts.dueDay,
          paymentStatus: debtAccounts.paymentStatus,
        })
        .from(debtAccounts)
        .where(and(eq(debtAccounts.userId, userId), eq(debtAccounts.id, debtId)))
        .limit(1);
      return row ?? null;
    },

    listPayments(userId, debtId) {
      return client
        .select({ id: debtPayments.id, amount: debtPayments.amount, paidAt: debtPayments.paidAt })
        .from(debtPayments)
        .where(and(eq(debtPayments.userId, userId), eq(debtPayments.debtId, debtId)))
        .orderBy(desc(debtPayments.paidAt));
    },
  };
}

export const debtDetailRepository = createDebtDetailRepository();
