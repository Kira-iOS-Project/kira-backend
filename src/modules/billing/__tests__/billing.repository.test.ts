import { describe, expect, test } from 'bun:test';
import {
  BILLING_PERIOD,
  PAYMENT_METHOD,
  PLAN,
  SUBSCRIPTION_SOURCE,
} from '../../../lib/constants/plans.ts';
import { createFakeDb, inOrder } from '../../../test/fake-postgres.ts';
import { createBillingRepository } from '../billing.repository.ts';
import { NOW, USER_ID } from './helpers.ts';

const END = new Date('2026-11-16T05:10:00.000Z');

const storedRow = {
  id: 'sub-1',
  plan: PLAN.plus,
  period: BILLING_PERIOD.monthly,
  source: SUBSCRIPTION_SOURCE.purchase,
  paymentMethod: PAYMENT_METHOD.qris,
  currentPeriodStart: NOW.toISOString(),
  currentPeriodEnd: END.toISOString(),
  cancelAtPeriodEnd: false,
};

const mappedRow = { ...storedRow, currentPeriodStart: NOW, currentPeriodEnd: END };

describe('createBillingRepository', () => {
  test('finds the active subscription, or null', async () => {
    const fake = createFakeDb(inOrder([storedRow], []));
    const repository = createBillingRepository(fake.db);

    expect(await repository.findActiveSubscription(USER_ID)).toEqual(mappedRow);
    expect(await repository.findActiveSubscription(USER_ID)).toBeNull();
    expect(fake.queries[0]?.sql).toContain('"subscriptions"."status" = $2');
    expect(fake.queries[0]?.sql).toContain('limit $3');
  });

  test('reads the usage counters of one quota period, or null', async () => {
    const counters = { aiMessages: 4, receipts: 1, voiceSeconds: 0 };
    const fake = createFakeDb(inOrder([counters], []));
    const repository = createBillingRepository(fake.db);

    expect(await repository.findUsageCounters(USER_ID, '2026-10-16')).toEqual(counters);
    expect(await repository.findUsageCounters(USER_ID, '2026-10-16')).toBeNull();
    expect(fake.queries[0]?.params).toEqual([USER_ID, '2026-10-16', 1]);
  });

  test('ends the active plan, starts the new one and writes its invoice together', async () => {
    const fake = createFakeDb(inOrder([], [], [], [storedRow], []));
    const row = await createBillingRepository(fake.db).startSubscription({
      userId: USER_ID,
      plan: PLAN.plus,
      period: BILLING_PERIOD.monthly,
      paymentMethod: PAYMENT_METHOD.qris,
      amount: 29_000,
      start: NOW,
      end: END,
    });

    expect(row).toEqual(mappedRow);
    expect(fake.queries.map((query) => query.sql.split(' ').slice(0, 3).join(' '))).toEqual([
      'select "id" from',
      'select "id", "plan",',
      'update "subscriptions" set',
      'insert into "subscriptions"',
      'insert into "invoices"',
    ]);
    expect(fake.queries[4]?.params).toContain(29_000);
  });

  test('locks the person’s row first, so a second checkout waits and then replaces the first', async () => {
    const fake = createFakeDb(inOrder([{ id: USER_ID }], [], [], [storedRow], []));

    await createBillingRepository(fake.db).startSubscription({
      userId: USER_ID,
      plan: PLAN.plus,
      period: BILLING_PERIOD.monthly,
      paymentMethod: PAYMENT_METHOD.qris,
      amount: 29_000,
      start: NOW,
      end: END,
    });

    expect(fake.queries[0]?.sql).toBe(
      'select "id" from "users" where "users"."id" = $1 for no key update',
    );
    expect(fake.queries[0]?.params).toEqual([USER_ID]);
    expect(fake.queries[1]?.sql).toContain('"subscriptions"."status" = $');
  });

  test('a second checkout of the plan already active returns it, with no new invoice', async () => {
    const checkout = {
      userId: USER_ID,
      plan: PLAN.plus,
      period: BILLING_PERIOD.monthly,
      paymentMethod: PAYMENT_METHOD.qris,
      amount: 29_000,
      start: NOW,
      end: END,
    };
    const cancelled = { ...storedRow, cancelAtPeriodEnd: true };
    const fake = createFakeDb(
      inOrder(
        [],
        [storedRow],
        [],
        [cancelled],
        [],
        [storedRow],
        [],
        [],
        [storedRow],
        [],
        [storedRow],
        [],
      ),
    );
    const repository = createBillingRepository(fake.db);

    expect(await repository.startSubscription(checkout)).toEqual(mappedRow);
    expect(fake.queries).toHaveLength(2);
    await repository.startSubscription(checkout);
    expect(fake.queries.slice(2).map((query) => query.sql.split(' ')[0])).toEqual([
      'select',
      'select',
      'update',
      'insert',
      'insert',
    ]);
    await repository.startSubscription({ ...checkout, period: BILLING_PERIOD.yearly });
    expect(fake.queries).toHaveLength(12);
  });

  test('throws when the new subscription comes back empty', async () => {
    const fake = createFakeDb();
    const promise = createBillingRepository(fake.db).startSubscription({
      userId: USER_ID,
      plan: PLAN.young,
      period: BILLING_PERIOD.yearly,
      paymentMethod: PAYMENT_METHOD.appStore,
      amount: 150_000,
      start: NOW,
      end: END,
    });

    await expect(promise).rejects.toThrow('The subscription was not created');
  });

  test('cancels at period end and changes the method, returning the row or null', async () => {
    const fake = createFakeDb(inOrder([storedRow], [], [storedRow], []));
    const repository = createBillingRepository(fake.db);

    expect(await repository.cancelAtPeriodEnd('sub-1')).toEqual(mappedRow);
    expect(await repository.cancelAtPeriodEnd('sub-1')).toBeNull();
    expect(await repository.changePaymentMethod('sub-1', PAYMENT_METHOD.appStore)).toEqual(
      mappedRow,
    );
    expect(await repository.changePaymentMethod('sub-1', PAYMENT_METHOD.appStore)).toBeNull();
    expect(fake.queries[0]?.sql).toContain('"cancel_at_period_end" = $1');
    expect(fake.queries[2]?.params[0]).toBe(PAYMENT_METHOD.appStore);
  });

  test('lists invoices newest first with a limit', async () => {
    const invoice = {
      id: 'inv-1',
      plan: PLAN.plus,
      period: BILLING_PERIOD.monthly,
      amount: 29_000,
      paymentMethod: PAYMENT_METHOD.qris,
      periodStart: NOW.toISOString(),
      createdAt: NOW.toISOString(),
    };
    const fake = createFakeDb(inOrder([invoice]));

    const rows = await createBillingRepository(fake.db).listInvoices(USER_ID, 50);

    expect(rows).toEqual([{ ...invoice, periodStart: NOW, createdAt: NOW }]);
    expect(fake.queries[0]?.sql).toContain(
      'order by "invoices"."created_at" desc, "invoices"."id" desc limit $2',
    );
  });

  test('stores a gift, and throws when nothing comes back', async () => {
    const fake = createFakeDb(inOrder([{ id: 'gift-1' }], []));
    const repository = createBillingRepository(fake.db);
    const gift = { userId: USER_ID, months: 3, amount: 87_000, paymentMethod: PAYMENT_METHOD.qris };

    expect(await repository.createGift(gift)).toEqual({ id: 'gift-1' });
    await expect(repository.createGift(gift)).rejects.toThrow('The gift was not stored');
  });
});
