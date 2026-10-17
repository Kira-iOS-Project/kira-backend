/**
 * Budget's data access (AGENTS.md Rules 4 and 10), every read and write scoped to the person: the
 * saved limits, the income and payday they share with Beranda, and the spending per category.
 */

import { and, eq, gt, gte, isNull, lt, sql } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { db } from '../../db/client/index.ts';
import {
  budgets,
  debtAccounts,
  financialProfiles,
  transactions,
  users,
  type BudgetAllocation,
} from '../../db/schema/schema.ts';
import { TRANSACTION_TYPE } from '../../lib/constants/money.ts';
import { expenseCategorySchema } from '../../lib/money/money.schema.ts';
import type { Payday } from '../../lib/time/wib.ts';

type Spending = { category: BudgetAllocation['category']; amount: number };

export type BudgetRepository = {
  findAllocations(userId: string): Promise<BudgetAllocation[] | null>;
  /** The health check's income (0 before it) and the person's payday. */
  findIncomeAndPayday(userId: string): Promise<{ income: number; payday: Payday }>;
  spendingByCategory(userId: string, from: Date, to: Date): Promise<Spending[]>;
  /** The monthly instalments of the open debt accounts, together. */
  monthlyInstalments(userId: string): Promise<number>;
  /** Stores the limits and the payday together. */
  save(userId: string, allocations: BudgetAllocation[], payday: Payday): Promise<void>;
};

export function createBudgetRepository(client: PostgresJsDatabase = db): BudgetRepository {
  return {
    async findAllocations(userId) {
      const [row] = await client
        .select({ allocations: budgets.allocations })
        .from(budgets)
        .where(eq(budgets.userId, userId))
        .limit(1);
      return row?.allocations ?? null;
    },

    async findIncomeAndPayday(userId) {
      const [row] = await client
        .select({
          income: financialProfiles.netMonthlyIncome,
          day: users.paydayDay,
          endOfMonth: users.paydayEndOfMonth,
        })
        .from(users)
        .leftJoin(financialProfiles, eq(financialProfiles.userId, users.id))
        .where(eq(users.id, userId))
        .limit(1);
      return {
        income: row?.income ?? 0,
        payday: { day: row?.day ?? null, endOfMonth: row?.endOfMonth ?? false },
      };
    },

    async spendingByCategory(userId, from, to) {
      const rows = await client
        .select({
          category: transactions.category,
          amount: sql<number>`sum(${transactions.amount})`.mapWith(Number),
        })
        .from(transactions)
        .where(
          and(
            eq(transactions.userId, userId),
            eq(transactions.type, TRANSACTION_TYPE.expense),
            gte(transactions.occurredAt, from),
            lt(transactions.occurredAt, to),
          ),
        )
        .groupBy(transactions.category);
      /** An expense only ever carries an expense category; the parse keeps the type honest. */
      return rows.flatMap((row) => {
        const parsed = expenseCategorySchema.safeParse(row.category);
        return parsed.success ? [{ category: parsed.data, amount: row.amount }] : [];
      });
    },

    async monthlyInstalments(userId) {
      const [row] = await client
        .select({
          total: sql<number>`coalesce(sum(${debtAccounts.monthlyInstalment}), 0)`.mapWith(Number),
        })
        .from(debtAccounts)
        .where(
          and(
            eq(debtAccounts.userId, userId),
            isNull(debtAccounts.paidOffAt),
            gt(debtAccounts.remainingAmount, 0),
          ),
        );
      return row?.total ?? 0;
    },

    async save(userId, allocations, payday) {
      await client.transaction(async (tx) => {
        await tx
          .update(users)
          .set({ paydayDay: payday.day, paydayEndOfMonth: payday.endOfMonth })
          .where(eq(users.id, userId));
        await tx
          .insert(budgets)
          .values({ userId, allocations })
          .onConflictDoUpdate({
            target: budgets.userId,
            set: { allocations, updatedAt: new Date() },
          });
      });
    },
  };
}

export const budgetRepository = createBudgetRepository();
