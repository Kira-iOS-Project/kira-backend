/**
 * Rencanaku's data access (AGENTS.md Rules 4 and 10): the active plan, the open debt accounts with
 * their progress, and the payments marked against an account. Each write is one transaction.
 */

import { and, eq, gt, gte, isNull } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { db } from '../../db/client/index.ts';
import { debtAccounts, debtPayments, payoffPlans, users } from '../../db/schema/schema.ts';
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
export type Payment = { amount: number; from: number; to: number; paymentId: string };

/** A consumer account the plan paid off, and when. */
export type PaidDebt = PlanDebt & { paidOffAt: Date | null };
/** What became of a payment: applied, refused as a repeat, or the balance changed meanwhile. */
type PaymentOutcome = 'applied' | 'duplicate' | 'stale';

/** Thrown inside the payment's transaction to roll its insert back when the balance moved. */
const STALE_BALANCE = new Error('The balance changed meanwhile');

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
  /** The accounts paid off since `since` (the plan's start), the first paid first. */
  listPaidSince(userId: string, since: Date): Promise<PaidDebt[]>;
  /** Whether this client payment id was recorded already. */
  hasPayment(userId: string, paymentId: string): Promise<boolean>;
  /** Applies a payment once per client payment id, if the balance is still `from`. */
  recordPayment(userId: string, id: string, payment: Payment, now: Date): Promise<PaymentOutcome>;
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
        .orderBy(debtAccounts.createdAt, debtAccounts.id)
        .limit(DEBT_LIMIT);
    },

    listPaidSince(userId, since) {
      return client
        .select({ ...debtColumns, paidOffAt: debtAccounts.paidOffAt })
        .from(debtAccounts)
        .where(and(eq(debtAccounts.userId, userId), gte(debtAccounts.paidOffAt, since)))
        .orderBy(debtAccounts.paidOffAt, debtAccounts.id)
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
        /** The person's row, locked: a second Jadikan Rencanaku waits, then ends this plan. */
        await tx
          .select({ id: users.id })
          .from(users)
          .where(eq(users.id, userId))
          .for('no key update');
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

    async hasPayment(userId, paymentId) {
      const mine = eq(debtPayments.userId, userId);
      const where = and(mine, eq(debtPayments.clientPaymentId, paymentId));
      const [row] = await client.select({ id: debtPayments.id }).from(debtPayments).where(where);
      return row !== undefined;
    },

    async recordPayment(userId, debtId, payment, now) {
      try {
        return await client.transaction(async (tx) => {
          const [inserted] = await tx
            .insert(debtPayments)
            .values({
              debtId,
              userId,
              amount: payment.amount,
              clientPaymentId: payment.paymentId,
              paidAt: now,
            })
            .onConflictDoNothing({ target: [debtPayments.userId, debtPayments.clientPaymentId] })
            .returning({ id: debtPayments.id });
          if (!inserted) return 'duplicate';
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
          if (updated.length === 0) throw STALE_BALANCE;
          return 'applied';
        });
      } catch (error) {
        if (error === STALE_BALANCE) return 'stale';
        throw error;
      }
    },
  };
}

export const planRepository = createPlanRepository();
