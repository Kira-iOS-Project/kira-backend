/**
 * Paket Kira, Langganan and Traktir Kira (AKN-06 to AKN-07g). Payments are a simulation in this
 * release: a checkout activates the plan at once and writes an invoice, and nothing is charged.
 */

import {
  BILLING_PERIOD,
  PLAN,
  PLAN_TERMS,
  SUBSCRIPTION_SOURCE,
} from '../../lib/constants/plans.ts';
import { addMonthsToInstant } from '../../lib/time/instant.ts';
import { addDays, wibDate } from '../../lib/time/wib.ts';
import { quotaPeriod, usageOf } from '../../lib/usage/plan-usage.ts';
import {
  SubscriptionNotCancellableError,
  SubscriptionNotFoundError,
  SubscriptionNotPaidError,
} from './billing.errors.ts';
import {
  type BillingRepository,
  billingRepository,
  type SubscriptionRow,
} from './billing.repository.ts';
import type {
  BillingPeriod,
  CheckoutBody,
  GiftBody,
  GiftResponse,
  InvoicesResponse,
  PaymentMethod,
  PlansResponse,
  SubscriptionResponse,
} from './billing.schema.ts';

/** The renewal reminder goes out this many days before the renewal date. */
export const REMINDER_DAYS_BEFORE = 3;
const INVOICE_LIMIT = 50;
const MONTHS_IN_PERIOD: Record<BillingPeriod, number> = {
  [BILLING_PERIOD.monthly]: 1,
  [BILLING_PERIOD.yearly]: 12,
};

type BillingDeps = { repository?: BillingRepository; now?: () => Date };

function resolve(deps: BillingDeps) {
  return { repository: deps.repository ?? billingRepository, now: deps.now?.() ?? new Date() };
}

/** What one period of a plan costs, in whole rupiah. */
export function priceOf(plan: SubscriptionRow['plan'], period: BillingPeriod): number {
  const terms = PLAN_TERMS[plan];
  return period === BILLING_PERIOD.yearly ? terms.yearlyPrice : terms.monthlyPrice;
}

/** The end of a period that starts at `start`. */
export function periodEnd(start: Date, period: BillingPeriod): Date {
  return addMonthsToInstant(start, MONTHS_IN_PERIOD[period]);
}

async function present(
  row: SubscriptionRow,
  userId: string,
  repository: BillingRepository,
  now: Date,
): Promise<SubscriptionResponse> {
  const { start, resetsOn } = quotaPeriod(row, wibDate(now));
  const counters = await repository.findUsageCounters(userId, start);
  const renewsOn = wibDate(row.currentPeriodEnd);
  return {
    id: row.id,
    plan: row.plan,
    period: row.period,
    source: row.source,
    price: row.source === SUBSCRIPTION_SOURCE.scholarship ? 0 : priceOf(row.plan, row.period),
    paymentMethod: row.paymentMethod,
    currentPeriodStart: row.currentPeriodStart.toISOString(),
    renewsOn,
    reminderOn: addDays(renewsOn, -REMINDER_DAYS_BEFORE),
    cancelAtPeriodEnd: row.cancelAtPeriodEnd,
    usage: usageOf(counters, row.plan, resetsOn),
  };
}

async function activeOrThrow(repository: BillingRepository, userId: string) {
  const row = await repository.findActiveSubscription(userId);
  if (!row) throw new SubscriptionNotFoundError();
  return row;
}

/** Paket Kira: the three plans from PLAN_TERMS and the one the person is on. */
export async function listPlans(userId: string, deps: BillingDeps = {}): Promise<PlansResponse> {
  const { repository } = resolve(deps);
  const active = await repository.findActiveSubscription(userId);
  const plans = Object.values(PLAN).map((id) => {
    const terms = PLAN_TERMS[id];
    return Object.assign({ id }, terms, {
      yearlySaving: terms.monthlyPrice * 12 - terms.yearlyPrice,
    });
  });
  return {
    plans,
    current: active
      ? { plan: active.plan, period: active.period }
      : { plan: PLAN.free, period: null },
  };
}

/** Bayar (simulasi): the plan is active now, replacing any other, and an invoice is written. */
export async function checkout(
  userId: string,
  body: CheckoutBody,
  deps: BillingDeps = {},
): Promise<SubscriptionResponse> {
  const { repository, now } = resolve(deps);
  const row = await repository.startSubscription({
    userId,
    ...body,
    amount: priceOf(body.plan, body.period),
    start: now,
    end: periodEnd(now, body.period),
  });
  return present(row, userId, repository, now);
}

export async function getSubscription(
  userId: string,
  deps: BillingDeps = {},
): Promise<SubscriptionResponse> {
  const { repository, now } = resolve(deps);
  return present(await activeOrThrow(repository, userId), userId, repository, now);
}

/** Batalkan Langganan: the plan stays until the period ends, then Kira Gratis. */
export async function cancelSubscription(
  userId: string,
  deps: BillingDeps = {},
): Promise<SubscriptionResponse> {
  const { repository, now } = resolve(deps);
  const active = await activeOrThrow(repository, userId);
  if (active.source === SUBSCRIPTION_SOURCE.scholarship) {
    throw new SubscriptionNotCancellableError('scholarship grant');
  }
  const row = active.cancelAtPeriodEnd
    ? active
    : ((await repository.cancelAtPeriodEnd(active.id)) ?? active);
  return present(row, userId, repository, now);
}

/** Metode Pembayaran: shown only in this release; the next simulated renewal uses it. */
export async function changePaymentMethod(
  userId: string,
  paymentMethod: PaymentMethod,
  deps: BillingDeps = {},
): Promise<SubscriptionResponse> {
  const { repository, now } = resolve(deps);
  const active = await activeOrThrow(repository, userId);
  if (active.source === SUBSCRIPTION_SOURCE.scholarship) throw new SubscriptionNotPaidError();
  const row = (await repository.changePaymentMethod(active.id, paymentMethod)) ?? active;
  return present(row, userId, repository, now);
}

/** Riwayat Tagihan: the latest invoices, newest first. */
export async function listInvoices(
  userId: string,
  deps: BillingDeps = {},
): Promise<InvoicesResponse> {
  const { repository } = resolve(deps);
  const rows = await repository.listInvoices(userId, INVOICE_LIMIT);
  return {
    items: rows.map((row) => ({
      id: row.id,
      plan: row.plan,
      period: row.period,
      amount: row.amount,
      paymentMethod: row.paymentMethod,
      periodStart: wibDate(row.periodStart),
      createdAt: row.createdAt.toISOString(),
    })),
  };
}

/** Traktir Kira (simulasi): months of Kira Plus that fund Beasiswa Kira's quota. */
export async function giftMonths(
  userId: string,
  body: GiftBody,
  deps: BillingDeps = {},
): Promise<GiftResponse> {
  const { repository } = resolve(deps);
  const amount = PLAN_TERMS.plus.monthlyPrice * body.months;
  const { id } = await repository.createGift({ userId, ...body, amount });
  return { id, months: body.months, amount };
}
