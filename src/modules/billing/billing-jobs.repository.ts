/**
 * The billing jobs' data access: the subscriptions whose renewal reminder is due, and the periods
 * that have run out (ended, or renewed by the simulation with an invoice each).
 */

import { and, eq, gt, inArray, isNull, lt, lte, or, sql } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { db } from '../../db/client/index.ts';
import { invoices, subscriptions, users } from '../../db/schema/schema.ts';
import {
  BILLING_PERIOD,
  PAYMENT_METHOD,
  SUBSCRIPTION_SOURCE,
  SUBSCRIPTION_STATUS,
} from '../../lib/constants/plans.ts';
import type { PlanId } from '../../lib/usage/plan-usage.ts';
import type { BillingPeriod, PaymentMethod } from './billing.schema.ts';

export type DueReminder = {
  subscriptionId: string;
  email: string;
  displayName: string;
  plan: PlanId;
  period: BillingPeriod;
  paymentMethod: PaymentMethod | null;
  currentPeriodEnd: Date;
};

export type BillingJobsRepository = {
  /** Active, bought, not cancelled, no reminder yet this period, renewing after `now` and before `before`. */
  findDueReminders(now: Date, before: Date, limit: number): Promise<DueReminder[]>;
  /** Marks the reminder sent at `now` unless another run already did; true when this run won it. */
  claimReminder(subscriptionId: string, now: Date): Promise<boolean>;
  /** Undoes this run's claim (the one stamped `now`) after its email failed, so a later run retries. */
  releaseReminder(subscriptionId: string, now: Date): Promise<void>;
  /** Ends the periods that ran out on a cancelled or granted plan; returns how many. */
  endFinishedPeriods(now: Date): Promise<number>;
  /** Moves the other run-out periods on by their length and writes their invoices; returns how many. */
  renewDuePeriods(
    now: Date,
    limit: number,
    priceOf: (plan: PlanId, period: BillingPeriod) => number,
  ): Promise<number>;
};

const WIB_ZONE = 'Asia/Jakarta';
const active = eq(subscriptions.status, SUBSCRIPTION_STATUS.active);

/**
 * The first period's start in WIB wall-clock time: the subscription's first invoice, written at
 * checkout. Every renewal counts from it, never from the previous end, so a plan bought on 31
 * January renews on 28 February and then on 31 March rather than drifting to the 28th for good.
 */
const anchor = sql`(coalesce((select min(${invoices.periodStart}) from ${invoices} where ${invoices.subscriptionId} = ${subscriptions.id}), ${subscriptions.currentPeriodStart}) at time zone ${WIB_ZONE})`;
const localEnd = sql`(${subscriptions.currentPeriodEnd} at time zone ${WIB_ZONE})`;
/** Whole months from the anchor to the current end, then one period more. */
const monthsToNextEnd = sql`((extract(year from ${localEnd}) - extract(year from ${anchor})) * 12 + extract(month from ${localEnd}) - extract(month from ${anchor}))::int + case when ${subscriptions.period} = ${BILLING_PERIOD.yearly} then 12 else 1 end`;
/** The anchor's WIB wall-clock time that many months on, a 31st clamped to a short month's last day. */
const nextPeriodEnd = sql`(${anchor} + make_interval(months => ${monthsToNextEnd})) at time zone ${WIB_ZONE}`;

export function createBillingJobsRepository(
  client: PostgresJsDatabase = db,
): BillingJobsRepository {
  return {
    findDueReminders(now, before, limit) {
      return client
        .select({
          subscriptionId: subscriptions.id,
          email: users.email,
          displayName: users.displayName,
          plan: subscriptions.plan,
          period: subscriptions.period,
          paymentMethod: subscriptions.paymentMethod,
          currentPeriodEnd: subscriptions.currentPeriodEnd,
        })
        .from(subscriptions)
        .innerJoin(users, eq(users.id, subscriptions.userId))
        .where(
          and(
            active,
            eq(subscriptions.source, SUBSCRIPTION_SOURCE.purchase),
            eq(subscriptions.cancelAtPeriodEnd, false),
            isNull(subscriptions.reminderSentAt),
            gt(subscriptions.currentPeriodEnd, now),
            lt(subscriptions.currentPeriodEnd, before),
          ),
        )
        .orderBy(subscriptions.currentPeriodEnd)
        .limit(limit);
    },

    async claimReminder(subscriptionId, now) {
      const rows = await client
        .update(subscriptions)
        .set({ reminderSentAt: now })
        .where(and(eq(subscriptions.id, subscriptionId), isNull(subscriptions.reminderSentAt)))
        .returning({ id: subscriptions.id });
      return rows.length > 0;
    },

    async releaseReminder(subscriptionId, now) {
      await client
        .update(subscriptions)
        .set({ reminderSentAt: null })
        .where(and(eq(subscriptions.id, subscriptionId), eq(subscriptions.reminderSentAt, now)));
    },

    async endFinishedPeriods(now) {
      const rows = await client
        .update(subscriptions)
        .set({ status: SUBSCRIPTION_STATUS.ended })
        .where(
          and(
            active,
            lte(subscriptions.currentPeriodEnd, now),
            or(
              eq(subscriptions.cancelAtPeriodEnd, true),
              eq(subscriptions.source, SUBSCRIPTION_SOURCE.scholarship),
            ),
          ),
        )
        .returning({ id: subscriptions.id });
      return rows.length;
    },

    renewDuePeriods(now, limit, priceOf) {
      return client.transaction(async (tx) => {
        /** A run that overlaps this one skips the rows it holds instead of renewing them again. */
        const runOut = and(active, lte(subscriptions.currentPeriodEnd, now));
        const due = tx
          .select({ id: subscriptions.id })
          .from(subscriptions)
          .where(runOut)
          .limit(limit)
          .for('update', { skipLocked: true });
        const renewed = await tx
          .update(subscriptions)
          .set({
            currentPeriodStart: sql`${subscriptions.currentPeriodEnd}`,
            currentPeriodEnd: nextPeriodEnd,
            reminderSentAt: null,
          })
          /** Repeated on the outer statement: a row renewed meanwhile is no longer due. */
          .where(and(inArray(subscriptions.id, due), runOut))
          .returning({
            id: subscriptions.id,
            userId: subscriptions.userId,
            plan: subscriptions.plan,
            period: subscriptions.period,
            paymentMethod: subscriptions.paymentMethod,
            currentPeriodStart: subscriptions.currentPeriodStart,
            currentPeriodEnd: subscriptions.currentPeriodEnd,
          });
        if (renewed.length === 0) return 0;
        await tx.insert(invoices).values(
          renewed.map((row) => ({
            userId: row.userId,
            subscriptionId: row.id,
            plan: row.plan,
            period: row.period,
            amount: priceOf(row.plan, row.period),
            paymentMethod: row.paymentMethod ?? PAYMENT_METHOD.qris,
            periodStart: row.currentPeriodStart,
            periodEnd: row.currentPeriodEnd,
          })),
        );
        return renewed.length;
      });
    },
  };
}

export const billingJobsRepository = createBillingJobsRepository();
