/**
 * The usage module's data access (AGENTS.md Rules 4 and 10): the active subscription and the quota
 * counters of a period.
 */

import { and, eq } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { db } from '../../db/client/index.ts';
import { subscriptions, usageCounters } from '../../db/schema/schema.ts';
import { SUBSCRIPTION_STATUS } from '../../lib/constants/plans.ts';
import type { PlanSubscription, UsageCounters } from '../../lib/usage/plan-usage.ts';

export type UsageRepository = {
  findActiveSubscriptions(userId: string): Promise<PlanSubscription[]>;
  findCounters(userId: string, periodStart: string): Promise<UsageCounters | null>;
};

export function createUsageRepository(client: PostgresJsDatabase = db): UsageRepository {
  return {
    findActiveSubscriptions: (userId) =>
      client
        .select({
          plan: subscriptions.plan,
          source: subscriptions.source,
          status: subscriptions.status,
          currentPeriodStart: subscriptions.currentPeriodStart,
          currentPeriodEnd: subscriptions.currentPeriodEnd,
        })
        .from(subscriptions)
        .where(
          and(
            eq(subscriptions.userId, userId),
            eq(subscriptions.status, SUBSCRIPTION_STATUS.active),
          ),
        )
        .limit(1),

    async findCounters(userId, periodStart) {
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
  };
}

export const usageRepository = createUsageRepository();
