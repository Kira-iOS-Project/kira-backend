/**
 * Kira Peduli's tables (PED-02, PED-05, PED-10), kept apart from the financial ones: crisis
 * signals (a level, a source and a time, never the words), check-ins, and the safety plan, stored
 * only sealed with AES-256-GCM. Each goes with its person (onDelete cascade).
 */

import { sql } from 'drizzle-orm';
import { index, pgEnum, pgTable, text, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import {
  CARE_SIGNAL_LEVEL,
  CARE_SIGNAL_SOURCE,
  CHECK_IN_STATUS,
  ONE_PENDING_CHECK_IN_INDEX,
} from '../../lib/constants/care.ts';
import { enumValues } from '../../lib/constants/enum-values.ts';
import { users } from './accounts.ts';
import { moment, timestamps } from './columns.ts';

export const careSignalLevelEnum = pgEnum('care_signal_level', enumValues(CARE_SIGNAL_LEVEL));
export const careSignalSourceEnum = pgEnum('care_signal_source', enumValues(CARE_SIGNAL_SOURCE));
export const checkInStatusEnum = pgEnum('check_in_status', enumValues(CHECK_IN_STATUS));

export const careSignals = pgTable(
  'care_signals',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    level: careSignalLevelEnum('level').notNull(),
    source: careSignalSourceEnum('source').notNull(),
    createdAt: moment('created_at').defaultNow().notNull(),
  },
  (table) => [index('care_signals_user_idx').on(table.userId)],
);

export const careCheckIns = pgTable(
  'care_check_ins',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    status: checkInStatusEnum('status').default(CHECK_IN_STATUS.scheduled).notNull(),
    dueAt: moment('due_at').notNull(),
    seenAt: moment('seen_at'),
    ...timestamps,
  },
  (table) => [
    index('care_check_ins_user_status_due_idx').on(table.userId, table.status, table.dueAt),
    /** One pending check-in a person: scheduling another cancels the first in the same transaction. */
    uniqueIndex(ONE_PENDING_CHECK_IN_INDEX)
      .on(table.userId)
      .where(sql`${table.status} = ${sql.raw(`'${CHECK_IN_STATUS.scheduled}'`)}`),
  ],
);

export const careSafetyPlans = pgTable('care_safety_plans', {
  userId: uuid('user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  /** `v1.<iv>.<ciphertext and tag>`, base64url: the plan's JSON sealed with AES-256-GCM. */
  sealed: text('sealed').notNull(),
  ...timestamps,
});
