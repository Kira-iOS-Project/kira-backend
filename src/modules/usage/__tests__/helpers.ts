/**
 * Mock builders for the usage module's injected dependencies (AGENTS.md Rule 19).
 */

import { PLAN, SUBSCRIPTION_SOURCE, SUBSCRIPTION_STATUS } from '../../../lib/constants/plans.ts';
import type { PlanSubscription } from '../../../lib/usage/plan-usage.ts';
import type { UsageRepository } from '../usage.repository.ts';

export const NOW = new Date('2026-10-16T05:41:00.000Z');

export function createUsageRepositoryMock(
  overrides: Partial<UsageRepository> = {},
): UsageRepository {
  return {
    findActiveSubscriptions: async () => [],
    findCounters: async () => null,
    ...overrides,
  };
}

export function createSubscriptionMock(
  overrides: Partial<PlanSubscription> = {},
): PlanSubscription {
  return {
    plan: PLAN.plus,
    source: SUBSCRIPTION_SOURCE.purchase,
    status: SUBSCRIPTION_STATUS.active,
    currentPeriodStart: new Date('2026-09-04T17:00:00.000Z'),
    currentPeriodEnd: new Date('2026-11-04T17:00:00.000Z'),
    ...overrides,
  };
}
