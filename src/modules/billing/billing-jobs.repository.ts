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
  markRemindersSent(subscriptionIds: string[], now: Date): Promise<void>;
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

/** The same WIB wall-clock time one period later, a 31st falling on a short month's last day. */
const nextPeriodEnd = sql`((${subscriptions.currentPeriodEnd} at time zone ${WIB_ZONE}) + case when ${subscriptions.period} = ${BILLING_PERIOD.yearly} then interval '1 year' else interval '1 month' end) at time zone ${WIB_ZONE}`;

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

    async markRemindersSent(subscriptionIds, now) {
      if (subscriptionIds.length === 0) return;
      await client
        .update(subscriptions)
        .set({ reminderSentAt: now })
        .where(inArray(subscriptions.id, subscriptionIds));
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
        const due = tx
          .select({ id: subscriptions.id })
          .from(subscriptions)
          .where(and(active, lte(subscriptions.currentPeriodEnd, now)))
          .limit(limit);
        const renewed = await tx
          .update(subscriptions)
          .set({
            currentPeriodStart: sql`${subscriptions.currentPeriodEnd}`,
            currentPeriodEnd: nextPeriodEnd,
            reminderSentAt: null,
          })
          .where(inArray(subscriptions.id, due))
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
