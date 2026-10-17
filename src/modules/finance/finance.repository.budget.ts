import { and, asc, eq, gte, lt, sql } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { db } from '../../db/client/index.ts';
import { budgets, financialProfiles, transactions, users } from '../../db/schema/schema.ts';
import { TRANSACTION_TYPE } from '../../lib/constants/money.ts';
import { expenseCategorySchema } from '../../lib/money/money.schema.ts';
import type { BudgetAllocationInput, PaydayChoice } from './finance.budget.schema.ts';
import type { z } from 'zod';

type ExpenseCategory = z.infer<typeof expenseCategorySchema>;

type BudgetRecord = {
  income: number;
  allocations: BudgetAllocationInput[];
  payday: PaydayChoice;
};
type BudgetGoalProfile = {
  createdAt: Date;
  essentialMonthlyExpenses: number | null;
  emergencyFund: number | null;
  maritalStatus: (typeof financialProfiles.$inferSelect)['maritalStatus'];
  dependents: number;
};
export type BudgetRepository = {
  getBudget(userId: string): Promise<BudgetRecord | null>;
  getProfileBudget(userId: string): Promise<{ income: number; payday: PaydayChoice }>;
  getBudgetGoalProfile(userId: string): Promise<BudgetGoalProfile | null>;
  spendingByCategory(
    userId: string,
    from: Date,
    to: Date,
  ): Promise<{ category: ExpenseCategory; amount: number }[]>;
};

function createBudgetRepository(client: PostgresJsDatabase = db): BudgetRepository {
  return {
    async getBudget(userId) {
      const [row] = await client
        .select({
          income: budgets.income,
          allocations: budgets.allocations,
          payday: budgets.payday,
        })
        .from(budgets)
        .where(eq(budgets.userId, userId))
        .limit(1);
      return row ?? null;
    },

    async getProfileBudget(userId) {
      const [row] = await client
        .select({
          income: financialProfiles.netMonthlyIncome,
          paydayDay: users.paydayDay,
        })
        .from(users)
        .leftJoin(financialProfiles, eq(financialProfiles.userId, users.id))
        .where(eq(users.id, userId))
        .limit(1);
      return {
        income: row?.income ?? 0,
        payday: row?.paydayDay ? { type: 'day', day: row.paydayDay } : { type: 'endOfMonth' },
      };
    },

    async getBudgetGoalProfile(userId) {
      const [row] = await client
        .select({
          createdAt: users.createdAt,
          essentialMonthlyExpenses: financialProfiles.essentialMonthlyExpenses,
          emergencyFund: financialProfiles.emergencyFund,
          maritalStatus: financialProfiles.maritalStatus,
          dependents: financialProfiles.dependents,
        })
        .from(users)
        .leftJoin(financialProfiles, eq(financialProfiles.userId, users.id))
        .where(eq(users.id, userId))
        .limit(1);
      return row?.createdAt ? { ...row, dependents: row.dependents ?? 0 } : null;
    },

    async spendingByCategory(userId, from, to) {
      const rows = await client
        .select({
          category: transactions.category,
          amount: sql<number>`coalesce(sum(${transactions.amount}), 0)`.mapWith(Number),
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
        .groupBy(transactions.category)
        .orderBy(asc(transactions.category))
        .limit(30);
      return rows.flatMap((row) => {
        const parsed = expenseCategorySchema.safeParse(row.category);
        return parsed.success ? [{ category: parsed.data, amount: row.amount }] : [];
      });
    },
  };
}

export const budgetRepository = createBudgetRepository();
