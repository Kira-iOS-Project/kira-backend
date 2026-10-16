/**
 * Plans and Beasiswa Kira (AKN-06 to AKN-10): subscriptions, the invoices of the simulated
 * payments, Traktir Kira gifts and scholarship applications. Payments are a simulation in this
 * release: nothing is charged.
 */

import {
  bigint,
  boolean,
  check,
  index,
  pgEnum,
  pgTable,
  smallint,
  text,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { enumValues } from '../../lib/constants/enum-values.ts';
import {
  BILLING_PERIOD,
  PAYMENT_METHOD,
  PLAN,
  SUBSCRIPTION_SOURCE,
  SUBSCRIPTION_STATUS,
} from '../../lib/constants/plans.ts';
import {
  APPLICATION_STATUS,
  OPEN_APPLICATION_INDEX,
  SCHOLARSHIP_SITUATION,
} from '../../lib/constants/scholarship.ts';
import { users } from './accounts.ts';
import { moment, timestamps } from './columns.ts';

export const planEnum = pgEnum('plan', enumValues(PLAN));
export const billingPeriodEnum = pgEnum('billing_period', enumValues(BILLING_PERIOD));
export const paymentMethodEnum = pgEnum('payment_method', enumValues(PAYMENT_METHOD));
export const subscriptionSourceEnum = pgEnum(
  'subscription_source',
  enumValues(SUBSCRIPTION_SOURCE),
);
export const subscriptionStatusEnum = pgEnum(
  'subscription_status',
  enumValues(SUBSCRIPTION_STATUS),
);
export const scholarshipSituationEnum = pgEnum(
  'scholarship_situation',
  enumValues(SCHOLARSHIP_SITUATION),
);
export const applicationStatusEnum = pgEnum('application_status', enumValues(APPLICATION_STATUS));

/** A paid or granted plan; Kira Gratis is the absence of an active row. */
export const subscriptions = pgTable(
  'subscriptions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    plan: planEnum('plan').notNull(),
    period: billingPeriodEnum('period').notNull(),
    source: subscriptionSourceEnum('source').notNull(),
    paymentMethod: paymentMethodEnum('payment_method'),
    status: subscriptionStatusEnum('status').notNull(),
    currentPeriodStart: moment('current_period_start').notNull(),
    /** The renewal date, or the last day of a granted or cancelled plan. */
    currentPeriodEnd: moment('current_period_end').notNull(),
    cancelAtPeriodEnd: boolean('cancel_at_period_end').default(false).notNull(),
    /** The renewal reminder for the current period went out (3 days before, by email). */
    reminderSentAt: moment('reminder_sent_at'),
    ...timestamps,
  },
  (table) => [
    index('subscriptions_user_idx').on(table.userId),
    uniqueIndex('subscriptions_one_active_idx')
      .on(table.userId)
      .where(sql`${table.status} = ${sql.raw(`'${SUBSCRIPTION_STATUS.active}'`)}`),
    index('subscriptions_status_period_end_idx').on(table.status, table.currentPeriodEnd),
  ],
);

export const invoices = pgTable(
  'invoices',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    subscriptionId: uuid('subscription_id').references(() => subscriptions.id, {
      onDelete: 'set null',
    }),
    plan: planEnum('plan').notNull(),
    period: billingPeriodEnum('period').notNull(),
    amount: bigint('amount', { mode: 'number' }).notNull(),
    paymentMethod: paymentMethodEnum('payment_method').notNull(),
    periodStart: moment('period_start').notNull(),
    periodEnd: moment('period_end').notNull(),
    createdAt: moment('created_at').defaultNow().notNull(),
  },
  (table) => [
    index('invoices_user_created_idx').on(table.userId, table.createdAt.desc().nullsFirst()),
    index('invoices_subscription_idx').on(table.subscriptionId),
    check('invoices_amount_check', sql`${table.amount} >= 0`),
  ],
);

/** Traktir Kira: months of Kira Plus bought for Beasiswa Kira. The giver stays anonymous. */
export const gifts = pgTable(
  'gifts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
    months: smallint('months').notNull(),
    amount: bigint('amount', { mode: 'number' }).notNull(),
    paymentMethod: paymentMethodEnum('payment_method').notNull(),
    createdAt: moment('created_at').defaultNow().notNull(),
  },
  (table) => [
    index('gifts_user_idx').on(table.userId),
    index('gifts_created_idx').on(table.createdAt),
    /** Traktir Kira sells one, three or six months (GIFT_MONTHS in modules/billing/billing.schema.ts). */
    check('gifts_months_check', sql`${table.months} in (1, 3, 6)`),
    check('gifts_amount_check', sql`${table.amount} > 0`),
  ],
);

export const scholarshipApplications = pgTable(
  'scholarship_applications',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    situations: scholarshipSituationEnum('situations').array().notNull(),
    /** Optional, read by the review team only. */
    story: text('story'),
    usedDebtEmergencyMode: boolean('used_debt_emergency_mode').notNull(),
    status: applicationStatusEnum('status').notNull(),
    submittedAt: moment('submitted_at').defaultNow().notNull(),
    decidedAt: moment('decided_at'),
    subscriptionId: uuid('subscription_id').references(() => subscriptions.id, {
      onDelete: 'set null',
    }),
    resultEmailSentAt: moment('result_email_sent_at'),
    ...timestamps,
  },
  (table) => [
    index('scholarship_applications_user_submitted_idx').on(
      table.userId,
      table.submittedAt.desc().nullsFirst(),
    ),
    index('scholarship_applications_status_submitted_idx').on(table.status, table.submittedAt),
    index('scholarship_applications_subscription_idx').on(table.subscriptionId),
    /** One open (in review or waitlisted) application a person; the service maps a clash to 409. */
    uniqueIndex(OPEN_APPLICATION_INDEX)
      .on(table.userId)
      .where(
        sql`${table.status} in (${sql.raw(
          [APPLICATION_STATUS.inReview, APPLICATION_STATUS.waitlisted]
            .map((status) => `'${status}'`)
            .join(', '),
        )})`,
      ),
    /** The result emails still to send, oldest decision first. */
    index('scholarship_applications_unsent_result_idx')
      .on(table.decidedAt)
      .where(
        sql`${table.status} = ${sql.raw(`'${APPLICATION_STATUS.accepted}'`)} and ${table.resultEmailSentAt} is null`,
      ),
    check('scholarship_applications_situations_check', sql`cardinality(${table.situations}) >= 1`),
    /** Ajukan Beasiswa's story field (STORY_MAX_LENGTH in modules/scholarship/scholarship.schema.ts). */
    check('scholarship_applications_story_check', sql`char_length(${table.story}) <= 1000`),
  ],
);
