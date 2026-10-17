/**
 * Atur Budget (UNG-05): one row per person with the limit set for each expense category. The income
 * is the health check's and the payday the person's own (users), so Budget and Beranda share both.
 */

import { jsonb, pgTable, uuid } from 'drizzle-orm/pg-core';
import type { z } from 'zod';
import type { expenseCategorySchema } from '../../lib/money/money.schema.ts';
import { users } from './accounts.ts';
import { timestamps } from './columns.ts';

export type BudgetAllocation = {
  category: z.infer<typeof expenseCategorySchema>;
  amount: number;
};

export const budgets = pgTable('budgets', {
  userId: uuid('user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  allocations: jsonb('allocations').$type<BudgetAllocation[]>().notNull(),
  ...timestamps,
});
