/**
 * What the health check learns about a person's money (ONB-10 to ONB-12 and the added steps 2, 4
 * and 5), their debt accounts, and the Kira Score snapshots taken from them.
 */

import {
  bigint,
  check,
  date,
  index,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  smallint,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { enumValues } from '../../lib/constants/enum-values.ts';
import {
  DEBT_KIND,
  DEBT_PAYMENT_STATUS,
  MARITAL_STATUS,
  MAX_ANNUAL_INTEREST_RATE,
  PROTECTION,
} from '../../lib/constants/profile.ts';
import { INDICATOR, SCORE_BAND, SNAPSHOT_REASON } from '../../lib/constants/score.ts';
import { users } from './accounts.ts';
import { moment, timestamps } from './columns.ts';

export const maritalStatusEnum = pgEnum('marital_status', enumValues(MARITAL_STATUS));
export const protectionEnum = pgEnum('protection', enumValues(PROTECTION));
export const debtKindEnum = pgEnum('debt_kind', enumValues(DEBT_KIND));
export const debtPaymentStatusEnum = pgEnum('debt_payment_status', enumValues(DEBT_PAYMENT_STATUS));
export const scoreBandEnum = pgEnum('score_band', enumValues(SCORE_BAND));
export const snapshotReasonEnum = pgEnum('snapshot_reason', enumValues(SNAPSHOT_REASON));

/** Whole rupiah: Kira writes every amount with ",00" and never stores a fraction. */
function rupiah(name: string) {
  return bigint(name, { mode: 'number' });
}

/** The health-check answers; a skipped question stays null and its indicator scores 0. */
export const financialProfiles = pgTable(
  'financial_profiles',
  {
    userId: uuid('user_id')
      .primaryKey()
      .references(() => users.id, { onDelete: 'cascade' }),
    netMonthlyIncome: rupiah('net_monthly_income'),
    essentialMonthlyExpenses: rupiah('essential_monthly_expenses'),
    emergencyFund: rupiah('emergency_fund'),
    monthlySavings: rupiah('monthly_savings'),
    /** Tabungan dan investasi lain, outside the emergency fund. */
    otherAssets: rupiah('other_assets'),
    /** Kendaraan dan properti. */
    propertyAssets: rupiah('property_assets'),
    /** 0, 1, 2, or 3 for "3 Orang atau Lebih". */
    dependents: smallint('dependents').default(0).notNull(),
    maritalStatus: maritalStatusEnum('marital_status'),
    protections: protectionEnum('protections')
      .array()
      .default(sql`'{}'`)
      .notNull(),
    completedAt: moment('completed_at').notNull(),
    ...timestamps,
  },
  (table) => [
    check(
      'financial_profiles_amounts_check',
      sql`${table.netMonthlyIncome} >= 0 and ${table.essentialMonthlyExpenses} >= 0 and ${table.emergencyFund} >= 0 and ${table.monthlySavings} >= 0 and ${table.otherAssets} >= 0 and ${table.propertyAssets} >= 0`,
    ),
    check('financial_profiles_dependents_check', sql`${table.dependents} between 0 and 3`),
  ],
);

export const debtAccounts = pgTable(
  'debt_accounts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    kind: debtKindEnum('kind').notNull(),
    name: varchar('name', { length: 60 }).notNull(),
    /** The remaining balance when the account was added: the base of "sudah lunas". */
    originalAmount: rupiah('original_amount').notNull(),
    remainingAmount: rupiah('remaining_amount').notNull(),
    monthlyInstalment: rupiah('monthly_instalment').notNull(),
    remainingTenorMonths: smallint('remaining_tenor_months'),
    /** Bunga per tahun, in percent as the lender states it; null until the person says. */
    annualInterestRate: numeric('annual_interest_rate', { precision: 5, scale: 2, mode: 'number' }),
    /** Tanggal jatuh tempo: the day of the month the instalment is due, 1 to 31; null until known. */
    dueDay: smallint('due_day'),
    paymentStatus: debtPaymentStatusEnum('payment_status')
      .default(DEBT_PAYMENT_STATUS.onTime)
      .notNull(),
    paidOffAt: moment('paid_off_at'),
    ...timestamps,
  },
  (table) => [
    index('debt_accounts_user_idx').on(table.userId),
    check(
      'debt_accounts_amounts_check',
      sql`${table.remainingAmount} between 0 and ${table.originalAmount} and ${table.monthlyInstalment} >= 0`,
    ),
    check('debt_accounts_tenor_check', sql`${table.remainingTenorMonths} between 0 and 600`),
    check(
      'debt_accounts_rate_check',
      sql`${table.annualInterestRate} between 0 and ${sql.raw(String(MAX_ANNUAL_INTEREST_RATE))}`,
    ),
    check('debt_accounts_due_day_check', sql`${table.dueDay} between 1 and 31`),
  ],
);

export type IndicatorPoints = Record<(typeof INDICATOR)[keyof typeof INDICATOR], number>;

export const scoreSnapshots = pgTable(
  'score_snapshots',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    score: smallint('score').notNull(),
    band: scoreBandEnum('band').notNull(),
    indicators: jsonb('indicators').$type<IndicatorPoints>().notNull(),
    reason: snapshotReasonEnum('reason').notNull(),
    /** The payday period the snapshot belongs to (its first day, WIB). */
    periodStart: date('period_start', { mode: 'string' }).notNull(),
    createdAt: moment('created_at').defaultNow().notNull(),
  },
  (table) => [
    index('score_snapshots_user_created_idx').on(table.userId, table.createdAt.desc().nullsFirst()),
    /** One payday re-check per period: two reads racing at its start store it once. */
    uniqueIndex('score_snapshots_user_period_recompute_idx')
      .on(table.userId, table.periodStart)
      .where(sql`${table.reason} = ${sql.raw(`'${SNAPSHOT_REASON.recompute}'`)}`),
    check('score_snapshots_score_check', sql`${table.score} between 0 and 100`),
  ],
);
