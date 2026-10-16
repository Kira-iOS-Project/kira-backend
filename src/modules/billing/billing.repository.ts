/**
 * The billing module's data access for its routes (AGENTS.md Rules 4 and 10): the active
 * subscription, its usage counters, the simulated checkout, the invoices and Traktir Kira gifts.
 */

import { and, desc, eq } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { db } from '../../db/client/index.ts';
import { gifts, invoices, subscriptions, usageCounters } from '../../db/schema/schema.ts';
import { SUBSCRIPTION_SOURCE, SUBSCRIPTION_STATUS } from '../../lib/constants/plans.ts';
import type { PlanId, UsageCounters } from '../../lib/usage/plan-usage.ts';
import type { BillingPeriod, PaidPlan, PaymentMethod } from './billing.schema.ts';

export type SubscriptionRow = {
  id: string;
  plan: PlanId;
  period: BillingPeriod;
  source: (typeof SUBSCRIPTION_SOURCE)[keyof typeof SUBSCRIPTION_SOURCE];
  paymentMethod: PaymentMethod | null;
  currentPeriodStart: Date;
  currentPeriodEnd: Date;
  cancelAtPeriodEnd: boolean;
};

export type InvoiceRow = {
  id: string;
  plan: PlanId;
  period: BillingPeriod;
  amount: number;
  paymentMethod: PaymentMethod;
  periodStart: Date;
  createdAt: Date;
};

export type CheckoutInput = {
  userId: string;
  plan: PaidPlan;
  period: BillingPeriod;
  paymentMethod: PaymentMethod;
  amount: number;
  start: Date;
  end: Date;
};

export type BillingRepository = {
  findActiveSubscription(userId: string): Promise<SubscriptionRow | null>;
  findUsageCounters(userId: string, periodStart: string): Promise<UsageCounters | null>;
  /** Ends any active subscription, starts the new one and writes its invoice, together. */
  startSubscription(input: CheckoutInput): Promise<SubscriptionRow>;
  cancelAtPeriodEnd(subscriptionId: string): Promise<SubscriptionRow | null>;
  changePaymentMethod(
    subscriptionId: string,
    paymentMethod: PaymentMethod,
  ): Promise<SubscriptionRow | null>;
  listInvoices(userId: string, limit: number): Promise<InvoiceRow[]>;
  createGift(input: {
    userId: string;
    months: number;
    amount: number;
    paymentMethod: PaymentMethod;
  }): Promise<{ id: string }>;
};

const subscriptionColumns = {
  id: subscriptions.id,
  plan: subscriptions.plan,
  period: subscriptions.period,
  source: subscriptions.source,
  paymentMethod: subscriptions.paymentMethod,
  currentPeriodStart: subscriptions.currentPeriodStart,
  currentPeriodEnd: subscriptions.currentPeriodEnd,
  cancelAtPeriodEnd: subscriptions.cancelAtPeriodEnd,
};

const activeOf = (userId: string) =>
  and(eq(subscriptions.userId, userId), eq(subscriptions.status, SUBSCRIPTION_STATUS.active));

export function createBillingRepository(client: PostgresJsDatabase = db): BillingRepository {
  return {
    async findActiveSubscription(userId) {
      const [row] = await client
        .select(subscriptionColumns)
        .from(subscriptions)
        .where(activeOf(userId))
        .limit(1);
      return row ?? null;
    },

    async findUsageCounters(userId, periodStart) {
      const [row] = await client
        .select({
          aiMessages: usageCounters.aiMessages,
          receipts: usageCounters.receipts,
          voiceSeconds: usageCounters.voiceSeconds,
        })
        .from(usageCounters)
        .where(and(eq(usageCounters.userId, userId), eq(usageCounters.periodStart, periodStart)))
        .limit(1);
      return row ?? null;
    },

    startSubscription({ userId, plan, period, paymentMethod, amount, start, end }) {
      return client.transaction(async (tx) => {
        await tx
          .update(subscriptions)
          .set({ status: SUBSCRIPTION_STATUS.ended, currentPeriodEnd: start })
          .where(activeOf(userId));
        const [row] = await tx
          .insert(subscriptions)
          .values({
            userId,
            plan,
            period,
            source: SUBSCRIPTION_SOURCE.purchase,
            paymentMethod,
            status: SUBSCRIPTION_STATUS.active,
            currentPeriodStart: start,
            currentPeriodEnd: end,
          })
          .returning(subscriptionColumns);
        if (!row) throw new Error('The subscription was not created');
        await tx.insert(invoices).values({
          userId,
          subscriptionId: row.id,
          plan,
          period,
          amount,
          paymentMethod,
          periodStart: start,
          periodEnd: end,
        });
        return row;
      });
    },

    async cancelAtPeriodEnd(subscriptionId) {
      const [row] = await client
        .update(subscriptions)
        .set({ cancelAtPeriodEnd: true })
        .where(eq(subscriptions.id, subscriptionId))
        .returning(subscriptionColumns);
      return row ?? null;
    },

    async changePaymentMethod(subscriptionId, paymentMethod) {
      const [row] = await client
        .update(subscriptions)
        .set({ paymentMethod })
        .where(eq(subscriptions.id, subscriptionId))
        .returning(subscriptionColumns);
      return row ?? null;
    },

    listInvoices(userId, limit) {
      return client
        .select({
          id: invoices.id,
          plan: invoices.plan,
          period: invoices.period,
          amount: invoices.amount,
          paymentMethod: invoices.paymentMethod,
          periodStart: invoices.periodStart,
          createdAt: invoices.createdAt,
        })
        .from(invoices)
        .where(eq(invoices.userId, userId))
        .orderBy(desc(invoices.createdAt), desc(invoices.id))
        .limit(limit);
    },

    async createGift(input) {
      const [row] = await client.insert(gifts).values(input).returning({ id: gifts.id });
      if (!row) throw new Error('The gift was not stored');
      return row;
    },
  };
}

export const billingRepository = createBillingRepository();
