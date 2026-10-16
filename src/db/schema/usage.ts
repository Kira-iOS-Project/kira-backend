/**
 * The AI-backed inputs a person used in one quota period (Usage on Profil and Langganan): chat
 * messages read by Kira AI, receipts scanned and seconds of voice, counted against the plan.
 */

import { sql } from 'drizzle-orm';
import { check, date, integer, pgTable, primaryKey, uuid } from 'drizzle-orm/pg-core';
import { users } from './accounts.ts';
import { moment } from './columns.ts';

/** The AI-backed inputs used in one quota period (a calendar month, or a paid plan's period). */
export const usageCounters = pgTable(
  'usage_counters',
  {
    userId: uuid('user_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    periodStart: date('period_start', { mode: 'string' }).notNull(),
    aiMessages: integer('ai_messages').default(0).notNull(),
    receipts: integer('receipts').default(0).notNull(),
    voiceSeconds: integer('voice_seconds').default(0).notNull(),
    updatedAt: moment('updated_at')
      .default(sql`now()`)
      .notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.periodStart] }),
    check(
      'usage_counters_counts_check',
      sql`${table.aiMessages} >= 0 and ${table.receipts} >= 0 and ${table.voiceSeconds} >= 0`,
    ),
  ],
);
