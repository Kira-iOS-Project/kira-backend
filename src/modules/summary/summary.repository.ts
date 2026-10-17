/**
 * The summary module's data access (AGENTS.md Rules 4 and 10): a person's expenses per WIB day and
 * per category over a range, their total, and their budget.
 */

import { and, desc, eq, gte, lt, sql } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { db } from '../../db/client/index.ts';
import { type BudgetAllocation, budgets, transactions, users } from '../../db/schema/schema.ts';
import type { Payday } from '../../lib/time/wib.ts';
import { TRANSACTION_TYPE } from '../../lib/constants/money.ts';
import type { z } from 'zod';
import type { expenseCategorySchema } from '../../lib/money/money.schema.ts';

type ExpenseCategory = z.infer<typeof expenseCategorySchema>;

const WIB_DAY = sql<string>`to_char(${transactions.occurredAt} at time zone 'Asia/Jakarta', 'YYYY-MM-DD')`;
const SPENT = sql<number>`coalesce(sum(${transactions.amount}), 0)`.mapWith(Number);

export type SummaryRepository = {
  /** Expenses per WIB day within [from, to), days with spending only. */
  expenseByDay(userId: string, from: Date, to: Date): Promise<{ date: string; expense: number }[]>;
  /** Expenses per category within [from, to), largest first. */
  expenseByCategory(
    userId: string,
    from: Date,
    to: Date,
  ): Promise<{ category: ExpenseCategory; amount: number }[]>;
  /** All expenses within [from, to). */
  expenseTotal(userId: string, from: Date, to: Date): Promise<number>;
  findBudget(userId: string): Promise<{ allocations: BudgetAllocation[]; payday: Payday } | null>;
};

function expensesOf(userId: string, from: Date, to: Date) {
  return and(
    eq(transactions.userId, userId),
    eq(transactions.type, TRANSACTION_TYPE.expense),
    gte(transactions.occurredAt, from),
    lt(transactions.occurredAt, to),
  );
}

export function createSummaryRepository(client: PostgresJsDatabase = db): SummaryRepository {
  return {
    expenseByDay: (userId, from, to) =>
      client
        .select({ date: WIB_DAY, expense: SPENT })
        .from(transactions)
        .where(expensesOf(userId, from, to))
        .groupBy(WIB_DAY)
        .orderBy(WIB_DAY),

    async expenseByCategory(userId, from, to) {
      const rows = await client
        .select({ category: transactions.category, amount: SPENT })
        .from(transactions)
        .where(expensesOf(userId, from, to))
        .groupBy(transactions.category)
        .orderBy(desc(SPENT), transactions.category);
      return rows.filter(
        (row): row is { category: ExpenseCategory; amount: number } => row.amount > 0,
      );
    },

    async expenseTotal(userId, from, to) {
      const [row] = await client
        .select({ total: SPENT })
        .from(transactions)
        .where(expensesOf(userId, from, to));
      return row?.total ?? 0;
    },

    async findBudget(userId) {
      /** The payday is the account's (users), as Beranda and the budget read it. */
      const [row] = await client
        .select({
          allocations: budgets.allocations,
          day: users.paydayDay,
          endOfMonth: users.paydayEndOfMonth,
        })
        .from(budgets)
        .innerJoin(users, eq(users.id, budgets.userId))
        .where(eq(budgets.userId, userId))
        .limit(1);
      return row
        ? { allocations: row.allocations, payday: { day: row.day, endOfMonth: row.endOfMonth } }
        : null;
    },
  };
}

export const summaryRepository = createSummaryRepository();
