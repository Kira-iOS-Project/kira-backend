import { describe, expect, test } from 'bun:test';
import {
  BILLING_PERIOD,
  PAYMENT_METHOD,
  PLAN,
  SUBSCRIPTION_SOURCE,
} from '../../../lib/constants/plans.ts';
import { SubscriptionNotCancellableError, SubscriptionNotFoundError } from '../billing.errors.ts';
import {
  cancelSubscription,
  changePaymentMethod,
  checkout,
  getSubscription,
  giftMonths,
  listInvoices,
  listPlans,
  periodEnd,
} from '../billing.service.ts';
import { createBillingRepositoryMock, NOW, subscriptionRow, USER_ID } from './helpers.ts';

const now = () => NOW;

describe('listPlans', () => {
  test('lists the three plans with the yearly saving, on Kira Gratis', async () => {
    const result = await listPlans(USER_ID, { repository: createBillingRepositoryMock() });

    expect(result.current).toEqual({ plan: PLAN.free, period: null });
    expect(result.plans.map((plan) => plan.id)).toEqual([PLAN.free, PLAN.young, PLAN.plus]);
    expect(result.plans[1]?.yearlySaving).toBe(30_000);
    expect(result.plans[2]).toMatchObject({ yearlySaving: 58_000, voiceAndImport: true });
  });

  test('names the active plan and its period', async () => {
    const repository = createBillingRepositoryMock({
      findActiveSubscription: async () => subscriptionRow({ period: BILLING_PERIOD.yearly }),
    });

    expect((await listPlans(USER_ID, { repository })).current).toEqual({
      plan: PLAN.plus,
      period: BILLING_PERIOD.yearly,
    });
  });
});

describe('checkout', () => {
  test('starts a yearly plan a year long, at the yearly price, with its usage', async () => {
    const calls: unknown[] = [];
    const repository = createBillingRepositoryMock({
      startSubscription: async (input) => {
        calls.push(input);
        return subscriptionRow({ period: BILLING_PERIOD.yearly, currentPeriodEnd: input.end });
      },
      findUsageCounters: async () => ({ aiMessages: 12, receipts: 3, voiceSeconds: 60 }),
    });

    const result = await checkout(
      USER_ID,
      { plan: PLAN.plus, period: BILLING_PERIOD.yearly, paymentMethod: PAYMENT_METHOD.appStore },
      { repository, now },
    );

    expect(calls[0]).toMatchObject({ amount: 290_000, start: NOW });
    expect(result).toMatchObject({
      price: 290_000,
      renewsOn: '2027-10-16',
      reminderOn: '2027-10-13',
      currentPeriodStart: NOW.toISOString(),
    });
    expect(result.usage).toEqual({
      aiMessages: { used: 12, limit: 300 },
      receipts: { used: 3, limit: 150 },
      voiceSeconds: { used: 60, limit: 10_800 },
      resetsOn: '2026-11-16',
    });
  });

  test('ends a monthly period one month on', () => {
    expect(periodEnd(NOW, BILLING_PERIOD.monthly).toISOString()).toBe('2026-11-16T05:10:00.000Z');
  });
});

describe('getSubscription', () => {
  test('answers 404 on Kira Gratis', async () => {
    const promise = getSubscription(USER_ID, { repository: createBillingRepositoryMock() });

    await expect(promise).rejects.toBeInstanceOf(SubscriptionNotFoundError);
  });

  test('shows a grant at no price', async () => {
    const repository = createBillingRepositoryMock({
      findActiveSubscription: async () =>
        subscriptionRow({ source: SUBSCRIPTION_SOURCE.scholarship, paymentMethod: null }),
    });

    const result = await getSubscription(USER_ID, { repository, now });

    expect(result).toMatchObject({ price: 0, paymentMethod: null, renewsOn: '2026-11-16' });
  });

  test('runs on the real clock by default', async () => {
    const repository = createBillingRepositoryMock({
      findActiveSubscription: async () => subscriptionRow({ plan: PLAN.young }),
    });

    expect((await getSubscription(USER_ID, { repository })).price).toBe(15_000);
  });
});

describe('cancelSubscription', () => {
  test('refuses a grant', async () => {
    const repository = createBillingRepositoryMock({
      findActiveSubscription: async () =>
        subscriptionRow({ source: SUBSCRIPTION_SOURCE.scholarship }),
    });

    await expect(cancelSubscription(USER_ID, { repository, now })).rejects.toBeInstanceOf(
      SubscriptionNotCancellableError,
    );
  });

  test('cancels at the end of the period', async () => {
    const repository = createBillingRepositoryMock({
      findActiveSubscription: async () => subscriptionRow(),
      cancelAtPeriodEnd: async () => subscriptionRow({ cancelAtPeriodEnd: true }),
    });

    expect((await cancelSubscription(USER_ID, { repository, now })).cancelAtPeriodEnd).toBe(true);
  });

  test('answers the same subscription when already cancelled, or when the row vanished', async () => {
    let updates = 0;
    const cancelled = createBillingRepositoryMock({
      findActiveSubscription: async () => subscriptionRow({ cancelAtPeriodEnd: true }),
      cancelAtPeriodEnd: async () => {
        updates += 1;
        return null;
      },
    });
    const vanished = createBillingRepositoryMock({
      findActiveSubscription: async () => subscriptionRow(),
    });

    expect((await cancelSubscription(USER_ID, { repository: cancelled, now })).id).toBe('sub-1');
    expect((await cancelSubscription(USER_ID, { repository: vanished, now })).id).toBe('sub-1');
    expect(updates).toBe(0);
  });
});

describe('changePaymentMethod', () => {
  test('changes the method of the active subscription', async () => {
    const repository = createBillingRepositoryMock({
      findActiveSubscription: async () => subscriptionRow(),
      changePaymentMethod: async (_, paymentMethod) => subscriptionRow({ paymentMethod }),
    });

    const result = await changePaymentMethod(USER_ID, PAYMENT_METHOD.appStore, {
      repository,
      now,
    });

    expect(result.paymentMethod).toBe(PAYMENT_METHOD.appStore);
  });

  test('keeps the row it read when the update returned none', async () => {
    const repository = createBillingRepositoryMock({
      findActiveSubscription: async () => subscriptionRow(),
    });

    const result = await changePaymentMethod(USER_ID, PAYMENT_METHOD.appStore, {
      repository,
      now,
    });

    expect(result.paymentMethod).toBe(PAYMENT_METHOD.qris);
  });
});

describe('listInvoices', () => {
  test('writes the period start as a WIB date and the creation as an instant', async () => {
    const repository = createBillingRepositoryMock({
      listInvoices: async (_, limit) => [
        {
          id: `inv-${limit}`,
          plan: PLAN.plus,
          period: BILLING_PERIOD.monthly,
          amount: 29_000,
          paymentMethod: PAYMENT_METHOD.qris,
          periodStart: new Date('2026-10-15T20:00:00.000Z'),
          createdAt: NOW,
        },
      ],
    });

    expect((await listInvoices(USER_ID, { repository })).items).toEqual([
      {
        id: 'inv-50',
        plan: PLAN.plus,
        period: BILLING_PERIOD.monthly,
        amount: 29_000,
        paymentMethod: PAYMENT_METHOD.qris,
        periodStart: '2026-10-16',
        createdAt: NOW.toISOString(),
      },
    ]);
  });
});

describe('giftMonths', () => {
  test('prices the gift at Kira Plus monthly times the months', async () => {
    const stored: unknown[] = [];
    const repository = createBillingRepositoryMock({
      createGift: async (input) => {
        stored.push(input);
        return { id: 'gift-9' };
      },
    });

    const result = await giftMonths(
      USER_ID,
      { months: 3, paymentMethod: PAYMENT_METHOD.qris },
      { repository },
    );

    expect(result).toEqual({ id: 'gift-9', months: 3, amount: 87_000 });
    expect(stored[0]).toEqual({
      userId: USER_ID,
      months: 3,
      paymentMethod: PAYMENT_METHOD.qris,
      amount: 87_000,
    });
  });
});
