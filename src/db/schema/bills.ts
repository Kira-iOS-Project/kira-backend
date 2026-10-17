/**
 * Tagihan & Cicilan (UNG-06, UNG-07): the bills a person pays again and again, each on a day of
 * the month (or once, or yearly), optionally linked to one of their debt accounts as its
 * instalment. Category is the ledger's own expense category, so a bill and its transaction share
 * one vocabulary.
 */

import { sql } from 'drizzle-orm';
import {
  bigint,
  boolean,
  check,
  date,
  index,
  pgEnum,
  pgTable,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import { BILL_NAME_MAX, BILL_REPEAT } from '../../lib/constants/ung.ts';
import { enumValues } from '../../lib/constants/enum-values.ts';
import { MAX_AMOUNT } from '../../lib/money/money.schema.ts';
import { users } from './accounts.ts';
import { timestamps } from './columns.ts';
import { debtAccounts } from './finances.ts';
import { transactionCategoryEnum } from './ledger.ts';

export const billRepeatEnum = pgEnum('bill_repeat', enumValues(BILL_REPEAT));

export const bills = pgTable(
  'recurring_bills',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    name: varchar('name', { length: BILL_NAME_MAX }).notNull(),
    /** Always an expense category; the schema refuses an income one. */
    category: transactionCategoryEnum('category').notNull(),
    amount: bigint('amount', { mode: 'number' }).notNull(),
    /** "Perkiraan": the amount changes from month to month, so this is an estimate. */
    isEstimate: boolean('is_estimate').default(false).notNull(),
    repeats: billRepeatEnum('repeats').notNull(),
    /** The first due date; a monthly bill repeats on its day, a yearly one on its day and month. */
    dueOn: date('due_on', { mode: 'string' }).notNull(),
    /** Tandai Sudah Dibayar's last day. */
    lastPaidOn: date('last_paid_on', { mode: 'string' }),
    /** "Ini Cicilan Utang": the debt account this bill is the instalment of. */
    debtId: uuid('debt_id').references(() => debtAccounts.id, { onDelete: 'set null' }),
    ...timestamps,
  },
  (table) => [
    index('recurring_bills_user_idx').on(table.userId),
    index('recurring_bills_debt_idx').on(table.debtId),
    check(
      'recurring_bills_amount_check',
      sql`${table.amount} between 1 and ${sql.raw(String(MAX_AMOUNT))}`,
    ),
  ],
);
