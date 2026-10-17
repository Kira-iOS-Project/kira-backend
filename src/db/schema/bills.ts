/** Recurring bill schedules and the transaction rows used to mark each period paid. */

import { sql } from 'drizzle-orm';
import {
  bigint,
  check,
  date,
  index,
  pgEnum,
  pgTable,
  smallint,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import { enumValues } from '../../lib/constants/enum-values.ts';
import { BILL_REPEAT_INTERVAL } from '../../lib/constants/ung.ts';
import { MAX_AMOUNT } from '../../lib/money/money.schema.ts';
import { users } from './accounts.ts';
import { moment, timestamps } from './columns.ts';
import { debtAccounts } from './finances.ts';
import { transactionCategoryEnum, transactions } from './ledger.ts';

export const billRepeatIntervalEnum = pgEnum(
  'bill_repeat_interval',
  enumValues(BILL_REPEAT_INTERVAL),
);

export const recurringBills = pgTable(
  'recurring_bills',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    clientId: uuid('client_id').defaultRandom().notNull(),
    linkedDebtAccountId: uuid('linked_debt_account_id').references(() => debtAccounts.id, {
      onDelete: 'set null',
    }),
    name: varchar('name', { length: 80 }).notNull(),
    amount: bigint('amount', { mode: 'number' }).notNull(),
    category: transactionCategoryEnum('category').notNull(),
    nextDueDate: date('next_due_date', { mode: 'string' }).notNull(),
    repeatInterval: billRepeatIntervalEnum('repeat_interval').notNull(),
    installmentsTotal: smallint('installments_total'),
    installmentsRemaining: smallint('installments_remaining'),
    archivedAt: moment('archived_at'),
    ...timestamps,
  },
  (table) => [
    index('recurring_bills_user_due_idx').on(table.userId, table.archivedAt, table.nextDueDate),
    uniqueIndex('recurring_bills_user_client_idx').on(table.userId, table.clientId),
    index('recurring_bills_debt_account_idx').on(table.linkedDebtAccountId),
    check(
      'recurring_bills_amount_check',
      sql`${table.amount} between 1 and ${sql.raw(String(MAX_AMOUNT))}`,
    ),
    check(
      'recurring_bills_installments_check',
      sql`(${table.installmentsTotal} is null and ${table.installmentsRemaining} is null) or (${table.installmentsTotal} between 1 and 600 and ${table.installmentsRemaining} between 0 and ${table.installmentsTotal})`,
    ),
  ],
);

export const billPayments = pgTable(
  'bill_payments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    billId: uuid('bill_id')
      .references(() => recurringBills.id, { onDelete: 'cascade' })
      .notNull(),
    transactionId: uuid('transaction_id')
      .references(() => transactions.id, { onDelete: 'cascade' })
      .notNull(),
    clientId: uuid('client_id').notNull(),
    amount: bigint('amount', { mode: 'number' }).notNull(),
    periodStart: date('period_start', { mode: 'string' }).notNull(),
    paidAt: moment('paid_at').notNull(),
    createdAt: moment('created_at').defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('bill_payments_user_client_idx').on(table.userId, table.clientId),
    index('bill_payments_bill_period_idx').on(table.billId, table.periodStart),
    index('bill_payments_user_period_idx').on(table.userId, table.periodStart),
    index('bill_payments_transaction_idx').on(table.transactionId),
    check(
      'bill_payments_amount_check',
      sql`${table.amount} between 1 and ${sql.raw(String(MAX_AMOUNT))}`,
    ),
  ],
);
