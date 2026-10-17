/**
 * Rencanaku (SKR-04): the payoff plan a person committed to, and the payments they mark against a
 * debt account. A plan holds a method, an extra payment and the account it is focused on; a person
 * has one active plan at a time.
 */

import { bigint, check, index, pgEnum, pgTable, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { enumValues } from '../../lib/constants/enum-values.ts';
import { PAYOFF_METHOD } from '../../lib/constants/payoff.ts';
import { users } from './accounts.ts';
import { moment, timestamps } from './columns.ts';
import { debtAccounts } from './finances.ts';

export const payoffMethodEnum = pgEnum('payoff_method', enumValues(PAYOFF_METHOD));

export const payoffPlans = pgTable(
  'payoff_plans',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    method: payoffMethodEnum('method').notNull(),
    /** Rupiah a month on top of the instalments. */
    extraPayment: bigint('extra_payment', { mode: 'number' }).notNull(),
    /** The account being paid off now; null when it was deleted, and then the plan's order decides. */
    focusDebtId: uuid('focus_debt_id').references(() => debtAccounts.id, { onDelete: 'set null' }),
    /** Set when a newer plan replaces this one. */
    endedAt: moment('ended_at'),
    ...timestamps,
  },
  (table) => [
    index('payoff_plans_focus_debt_idx').on(table.focusDebtId),
    /** One active plan per person: a second insert is refused rather than raced. */
    uniqueIndex('payoff_plans_user_active_idx')
      .on(table.userId)
      .where(sql`${table.endedAt} is null`),
    check('payoff_plans_extra_check', sql`${table.extraPayment} >= 0`),
  ],
);

/** "Tandai Sudah Bayar": one row per payment made against a debt account. */
export const debtPayments = pgTable(
  'debt_payments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    debtId: uuid('debt_id')
      .references(() => debtAccounts.id, { onDelete: 'cascade' })
      .notNull(),
    userId: uuid('user_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    amount: bigint('amount', { mode: 'number' }).notNull(),
    /**
     * The client's id for this Tandai Sudah Bayar: a repeat of it (double tap, retry) is refused.
     * The API requires it; nullable only for payments recorded before it existed.
     */
    clientPaymentId: uuid('client_payment_id'),
    paidAt: moment('paid_at').defaultNow().notNull(),
    createdAt: moment('created_at').defaultNow().notNull(),
  },
  (table) => [
    index('debt_payments_debt_paid_idx').on(table.debtId, table.paidAt),
    index('debt_payments_user_idx').on(table.userId),
    uniqueIndex('debt_payments_user_client_idx').on(table.userId, table.clientPaymentId),
    check('debt_payments_amount_check', sql`${table.amount} > 0`),
  ],
);
