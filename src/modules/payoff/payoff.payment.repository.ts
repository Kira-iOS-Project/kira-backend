import { and, eq, isNull, sql } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { debtAccounts, debtPayments, transactions } from '../../db/schema/schema.ts';
import {
  EXPENSE_CATEGORY,
  TRANSACTION_SOURCE,
  TRANSACTION_TYPE,
} from '../../lib/constants/money.ts';
import type { Payment, PaymentOutcome } from './payoff.plan.repository.ts';

const STALE_BALANCE = new Error('The balance changed meanwhile');
const DUPLICATE_PAYMENT = new Error('This client payment id is already used');

export async function hasDebtPayment(
  client: PostgresJsDatabase,
  userId: string,
  paymentId: string,
) {
  const [row] = await client
    .select({ id: debtPayments.id })
    .from(debtPayments)
    .where(and(eq(debtPayments.userId, userId), eq(debtPayments.clientPaymentId, paymentId)));
  return row !== undefined;
}

export async function recordDebtPayment(
  client: PostgresJsDatabase,
  userId: string,
  debtId: string,
  payment: Payment,
  now: Date,
): Promise<PaymentOutcome> {
  try {
    return await client.transaction(async (tx) => {
      const [transaction] = await tx
        .insert(transactions)
        .values({
          userId,
          type: TRANSACTION_TYPE.expense,
          amount: payment.amount,
          category: EXPENSE_CATEGORY.paylaterInstalment,
          name: 'Pembayaran cicilan utang',
          occurredAt: now,
          source: TRANSACTION_SOURCE.manual,
          clientId: payment.paymentId,
          createdAt: now,
          updatedAt: now,
        })
        .onConflictDoNothing({ target: [transactions.userId, transactions.clientId] })
        .returning({ id: transactions.id });
      if (!transaction) return 'duplicate';
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
      if (!inserted) throw DUPLICATE_PAYMENT;
      const updated = await tx
        .update(debtAccounts)
        .set({
          remainingAmount: payment.to,
          remainingTenorMonths:
            payment.to === 0
              ? 0
              : sql`case
                  when ${debtAccounts.remainingTenorMonths} is null then null
                  else greatest(${debtAccounts.remainingTenorMonths} - 1, 0)
                end`,
          paidOffAt: payment.to === 0 ? now : null,
          updatedAt: now,
        })
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
    if (error === DUPLICATE_PAYMENT) return 'duplicate';
    throw error;
  }
}
