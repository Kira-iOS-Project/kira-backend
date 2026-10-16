/**
 * Rencanaku's data access (AGENTS.md Rules 4 and 10): the active plan, the open debt accounts with
 * their progress, and the payments marked against an account. Each write is one transaction.
 */

import { and, eq, gt, isNull } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { db } from '../../db/client/index.ts';
import { debtAccounts, debtPayments, payoffPlans } from '../../db/schema/schema.ts';
import type { DEBT_PAYMENT_STATUS } from '../../lib/constants/profile.ts';
import type { PayoffMethod } from './payoff.engine.ts';
import type { OpenDebt } from './payoff.repository.ts';

type Values<T> = T[keyof T];

export type StoredPlan = {
  id: string;
  method: PayoffMethod;
  extraPayment: number;
  focusDebtId: string | null;
  createdAt: Date;
};

type NewPlan = Pick<StoredPlan, 'method' | 'extraPayment' | 'focusDebtId'>;

/** An open account with what Rencanaku needs to show its progress and score it. */
export type PlanDebt = OpenDebt & {
  /** The balance when the account was added: the base of "sudah lunas". */
  original: number;
  paymentStatus: Values<typeof DEBT_PAYMENT_STATUS>;
};

/** A payment as the repository applies it: the balance it expects and the one it leaves. */
export type Payment = { amount: number; from: number; to: number };

/** At most this many accounts are read: the quiz accepts twenty. */
const DEBT_LIMIT = 50;

const planColumns = {
  id: payoffPlans.id,
  method: payoffPlans.method,
  extraPayment: payoffPlans.extraPayment,
  focusDebtId: payoffPlans.focusDebtId,
  createdAt: payoffPlans.createdAt,
};

export type PlanRepository = {
  findActive(userId: string): Promise<StoredPlan | null>;
  listDebts(userId: string): Promise<PlanDebt[]>;
  findDebt(userId: string, debtId: string): Promise<PlanDebt | null>;
  /** Ends the active plan, if any, and stores the new one. */
  createPlan(userId: string, plan: NewPlan, now: Date): Promise<StoredPlan>;
  setFocus(planId: string, debtId: string): Promise<void>;
  /** Applies a payment if the balance is still `from`; false when it changed meanwhile. */
  recordPayment(userId: string, debtId: string, payment: Payment, now: Date): Promise<boolean>;
};

const debtColumns = {
  id: debtAccounts.id,
  kind: debtAccounts.kind,
  name: debtAccounts.name,
  remaining: debtAccounts.remainingAmount,
  original: debtAccounts.originalAmount,
  monthlyInstalment: debtAccounts.monthlyInstalment,
  annualInterestRate: debtAccounts.annualInterestRate,
  dueDay: debtAccounts.dueDay,
  paymentStatus: debtAccounts.paymentStatus,
};

const isOpen = (userId: string) =>
  and(
    eq(debtAccounts.userId, userId),
    isNull(debtAccounts.paidOffAt),
    gt(debtAccounts.remainingAmount, 0),
  );

export function createPlanRepository(client: PostgresJsDatabase = db): PlanRepository {
  return {
    async findActive(userId) {
      const [row] = await client
        .select(planColumns)
        .from(payoffPlans)
        .where(and(eq(payoffPlans.userId, userId), isNull(payoffPlans.endedAt)))
        .limit(1);
      return row ?? null;
    },

    listDebts(userId) {
      return client
        .select(debtColumns)
        .from(debtAccounts)
        .where(isOpen(userId))
        .orderBy(debtAccounts.createdAt)
        .limit(DEBT_LIMIT);
    },

    async findDebt(userId, debtId) {
      const [row] = await client
        .select(debtColumns)
        .from(debtAccounts)
        .where(and(isOpen(userId), eq(debtAccounts.id, debtId)))
        .limit(1);
      return row ?? null;
    },

    createPlan(userId, plan, now) {
      return client.transaction(async (tx) => {
        await tx
          .update(payoffPlans)
          .set({ endedAt: now })
          .where(and(eq(payoffPlans.userId, userId), isNull(payoffPlans.endedAt)));
        const [row] = await tx
          .insert(payoffPlans)
          .values({ userId, ...plan })
          .returning(planColumns);
        if (!row) throw new Error('The plan insert returned no row');
        return row;
      });
    },

    async setFocus(planId, debtId) {
      await client
        .update(payoffPlans)
        .set({ focusDebtId: debtId })
        .where(eq(payoffPlans.id, planId));
    },

    recordPayment(userId, debtId, payment, now) {
      return client.transaction(async (tx) => {
        const updated = await tx
          .update(debtAccounts)
          .set({ remainingAmount: payment.to, paidOffAt: payment.to === 0 ? now : null })
          .where(
            and(
              eq(debtAccounts.id, debtId),
              eq(debtAccounts.userId, userId),
              isNull(debtAccounts.paidOffAt),
              eq(debtAccounts.remainingAmount, payment.from),
            ),
          )
          .returning({ id: debtAccounts.id });
        if (updated.length === 0) return false;
        await tx
          .insert(debtPayments)
          .values({ debtId, userId, amount: payment.amount, paidAt: now });
        return true;
      });
    },
  };
}

export const planRepository = createPlanRepository();
