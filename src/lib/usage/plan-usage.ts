/**
 * Which plan a person is on and how much of its monthly quota they have used: the one rule Catat,
 * Akun and Billing compute the same way (AI messages, receipts and voice seconds, CAT-05 and
 * CAT-09). Kira Gratis counts by calendar month and refills on the 1st; a paid or granted plan
 * counts from the day of the month it started on. Pure: the modules read the rows and pass them in.
 */

import {
  PLAN,
  PLAN_TERMS,
  SUBSCRIPTION_STATUS,
  type SUBSCRIPTION_SOURCE,
} from '../constants/plans.ts';
import { addMonths, monthStart, wibDate } from '../time/wib.ts';

type Values<T> = T[keyof T];

export type PlanId = Values<typeof PLAN>;
export type SubscriptionSource = Values<typeof SUBSCRIPTION_SOURCE>;

/** The columns of a `subscriptions` row the plan rules read. */
export type PlanSubscription = {
  plan: PlanId;
  source: SubscriptionSource;
  status: Values<typeof SUBSCRIPTION_STATUS>;
  currentPeriodStart: Date;
  currentPeriodEnd: Date;
};

export type ActivePlan = {
  id: PlanId;
  source: SubscriptionSource | null;
  /** The WIB date the plan renews or ends; null on Kira Gratis. */
  renewsOn: string | null;
  subscription: PlanSubscription | null;
};

export type UsageCounters = { aiMessages: number; receipts: number; voiceSeconds: number };

type Meter = { used: number; limit: number };

export type Usage = {
  aiMessages: Meter;
  receipts: Meter;
  voiceSeconds: Meter;
  /** The WIB date the counters start again from zero. */
  resetsOn: string;
};

export type QuotaPeriod = { start: string; resetsOn: string };

/** The plan in force: the active subscription, or Kira Gratis when there is none. */
export function activePlanOf(rows: readonly PlanSubscription[]): ActivePlan {
  const subscription = rows.find((row) => row.status === SUBSCRIPTION_STATUS.active) ?? null;
  if (!subscription) return { id: PLAN.free, source: null, renewsOn: null, subscription: null };
  return {
    id: subscription.plan,
    source: subscription.source,
    renewsOn: wibDate(subscription.currentPeriodEnd),
    subscription,
  };
}

/** The months from `from` to `to`, counting calendar months only. */
function monthsBetween(from: string, to: string): number {
  const [fromYear = 0, fromMonth = 1] = from.split('-').map(Number);
  const [toYear = 0, toMonth = 1] = to.split('-').map(Number);
  return (toYear - fromYear) * 12 + (toMonth - fromMonth);
}

/**
 * The quota period `today` falls in. Without a subscription it is the calendar month; with one it
 * runs from the latest monthly anniversary of the plan's start (a yearly plan still refills every
 * month), a 31st anchor falling on a short month's last day.
 */
export function quotaPeriod(
  subscription: Pick<PlanSubscription, 'currentPeriodStart'> | null,
  today: string,
): QuotaPeriod {
  if (!subscription) {
    const start = monthStart(today);
    return { start, resetsOn: addMonths(start, 1) };
  }
  const anchor = wibDate(subscription.currentPeriodStart);
  if (today < anchor) return { start: anchor, resetsOn: addMonths(anchor, 1) };
  const months = monthsBetween(anchor, today);
  const elapsed = addMonths(anchor, months) <= today ? months : months - 1;
  return { start: addMonths(anchor, elapsed), resetsOn: addMonths(anchor, elapsed + 1) };
}

/** The first day of the quota period: the `period_start` key of `usage_counters`. */
export function quotaPeriodStart(
  subscription: Pick<PlanSubscription, 'currentPeriodStart'> | null,
  today: string,
): string {
  return quotaPeriod(subscription, today).start;
}

/** What has been used of the plan's quotas; no counter row yet means nothing used. */
export function usageOf(counters: UsageCounters | null, plan: PlanId, resetsOn: string): Usage {
  const terms = PLAN_TERMS[plan];
  return {
    aiMessages: { used: counters?.aiMessages ?? 0, limit: terms.aiMessages },
    receipts: { used: counters?.receipts ?? 0, limit: terms.receipts },
    voiceSeconds: { used: counters?.voiceSeconds ?? 0, limit: terms.voiceSeconds },
    resetsOn,
  };
}
