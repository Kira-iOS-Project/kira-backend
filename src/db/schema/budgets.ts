/** Current UNG budget allocation and payday selection. */

import { sql } from 'drizzle-orm';
import { bigint, check, jsonb, pgTable, uuid } from 'drizzle-orm/pg-core';
import type { z } from 'zod';
import { expenseCategorySchema, MAX_AMOUNT } from '../../lib/money/money.schema.ts';
import { users } from './accounts.ts';
import { moment } from './columns.ts';

export type BudgetAllocation = {
  category: z.infer<typeof expenseCategorySchema>;
  amount: number;
};
export type PaydayChoice = { type: 'day'; day: number } | { type: 'endOfMonth' };

export const budgets = pgTable(
  'budgets',
  {
    userId: uuid('user_id')
      .primaryKey()
      .references(() => users.id, { onDelete: 'cascade' }),
    income: bigint('income', { mode: 'number' }).notNull(),
    allocations: jsonb('allocations').$type<BudgetAllocation[]>().notNull(),
    payday: jsonb('payday').$type<PaydayChoice>().notNull(),
    updatedAt: moment('updated_at')
      .defaultNow()
      .notNull()
      .$onUpdateFn(() => new Date()),
  },
  (table) => [
    check(
      'budgets_income_check',
      sql`${table.income} between 0 and ${sql.raw(String(MAX_AMOUNT))}`,
    ),
  ],
);
