/**
 * Mock builders for the billing module's injected dependencies (AGENTS.md Rule 19).
 */

import {
  BILLING_PERIOD,
  PAYMENT_METHOD,
  PLAN,
  SUBSCRIPTION_SOURCE,
} from '../../../lib/constants/plans.ts';
import type { BillingJobsRepository } from '../billing-jobs.repository.ts';
import type { BillingRepository, SubscriptionRow } from '../billing.repository.ts';

/** Friday 16 October 2026, 12.10 WIB. */
export const NOW = new Date('2026-10-16T05:10:00.000Z');
export const USER_ID = 'user-1';

export function subscriptionRow(overrides: Partial<SubscriptionRow> = {}): SubscriptionRow {
  return {
    id: 'sub-1',
    plan: PLAN.plus,
    period: BILLING_PERIOD.monthly,
    source: SUBSCRIPTION_SOURCE.purchase,
    paymentMethod: PAYMENT_METHOD.qris,
    currentPeriodStart: NOW,
    currentPeriodEnd: new Date('2026-11-16T05:10:00.000Z'),
    cancelAtPeriodEnd: false,
    ...overrides,
  };
}

export function createBillingRepositoryMock(
  overrides: Partial<BillingRepository> = {},
): BillingRepository {
  return {
    findActiveSubscription: async () => null,
    findUsageCounters: async () => null,
    startSubscription: async () => subscriptionRow(),
    cancelAtPeriodEnd: async () => null,
    changePaymentMethod: async () => null,
    listInvoices: async () => [],
    createGift: async () => ({ id: 'gift-1' }),
    ...overrides,
  };
}

export function createBillingJobsRepositoryMock(
  overrides: Partial<BillingJobsRepository> = {},
): BillingJobsRepository {
  return {
    findDueReminders: async () => [],
    claimReminder: async () => true,
    releaseReminder: async () => undefined,
    endFinishedPeriods: async () => 0,
    renewDuePeriods: async () => 0,
    ...overrides,
  };
}
