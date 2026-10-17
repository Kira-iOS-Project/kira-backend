/**
 * The health check's debt accounts kept in step with a retake (Ulangi Cek Kesehatan), inside the
 * health check's transaction. A retake never deletes everything: debt_payments cascade from their
 * account, so that would lose payments, progress and the payoff plan's focus.
 * - Only the health check's own accounts (from_health_check) are touched; Dompet's are left alone.
 * - An answer matches an account by kind and name (trimmed, any case) and updates it in place, so
 *   its id, payments and focus stay.
 * - An account with a payment, or paid off, is never changed or removed: its balance is the record
 *   the payments made, and the quiz's figure for it is ignored.
 * - An answer with no match is a new account; an account no answer names, and not protected, goes.
 */

import { and, eq, inArray, sql } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { debtAccounts, debtPayments } from '../../db/schema/schema.ts';
import type { HealthCheckBody } from './score.schema.ts';

type Transaction = Parameters<Parameters<PostgresJsDatabase['transaction']>[0]>[0];
type QuizDebt = HealthCheckBody['debts'][number];

const keyOf = (kind: string, name: string) => `${kind}:${name.trim().toLowerCase()}`;

/** What the quiz says about an account; the balance it gives is the base of "sudah lunas". */
const fieldsOf = (debt: QuizDebt) => ({
  kind: debt.kind,
  name: debt.name,
  monthlyInstalment: debt.monthlyInstalment,
  remainingTenorMonths: debt.remainingTenorMonths,
  annualInterestRate: debt.annualInterestRate,
  dueDay: debt.dueDay,
  originalAmount: debt.remaining,
  remainingAmount: debt.remaining,
});

export async function syncHealthCheckDebts(
  tx: Transaction,
  userId: string,
  debts: QuizDebt[],
): Promise<void> {
  const unmatched = await tx
    .select({
      id: debtAccounts.id,
      kind: debtAccounts.kind,
      name: debtAccounts.name,
      /** The outer id spelled with its table: unqualified, it would name debt_payments' own id. */
      kept: sql<boolean>`(${debtAccounts.paidOffAt} is not null or exists (select 1 from ${debtPayments} where ${debtPayments.debtId} = "debt_accounts"."id"))`,
    })
    .from(debtAccounts)
    .where(and(eq(debtAccounts.userId, userId), eq(debtAccounts.fromHealthCheck, true)));
  const added: QuizDebt[] = [];
  const updates: { id: string; debt: QuizDebt }[] = [];
  for (const debt of debts) {
    const index = unmatched.findIndex(
      (row) => keyOf(row.kind, row.name) === keyOf(debt.kind, debt.name),
    );
    const [match] = index >= 0 ? unmatched.splice(index, 1) : [];
    if (!match) added.push(debt);
    else if (!match.kept) updates.push({ id: match.id, debt });
  }
  await Promise.all(
    updates.map(({ id, debt }) =>
      tx.update(debtAccounts).set(fieldsOf(debt)).where(eq(debtAccounts.id, id)),
    ),
  );
  const removed = unmatched.filter((row) => !row.kept).map((row) => row.id);
  if (removed.length > 0) await tx.delete(debtAccounts).where(inArray(debtAccounts.id, removed));
  if (added.length > 0) {
    await tx
      .insert(debtAccounts)
      .values(added.map((debt) => Object.assign({ userId }, fieldsOf(debt))));
  }
}
