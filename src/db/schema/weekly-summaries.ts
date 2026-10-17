/** Persisted opt-in reports for closed Thursday-Wednesday periods. */

import {
  bigint,
  date,
  index,
  pgTable,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import { TRANSACTION_TYPE } from '../../lib/constants/money.ts';
import { users } from './accounts.ts';

export const weeklySummaries = pgTable(
  'weekly_summaries',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    weekStart: date('week_start', { mode: 'string' }).notNull(),
    expense: bigint(TRANSACTION_TYPE.expense, { mode: 'number' }).notNull(),
    income: bigint(TRANSACTION_TYPE.income, { mode: 'number' }).notNull(),
    note: varchar('note', { length: 160 }),
    generatedAt: timestamp('generated_at', { withTimezone: true, mode: 'date' })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex('weekly_summaries_user_week_idx').on(table.userId, table.weekStart),
    index('weekly_summaries_week_idx').on(table.weekStart),
  ],
);
