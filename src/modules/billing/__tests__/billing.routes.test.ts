/**
 * The billing routes through the real app: the session gate, the real error mapper and the shared
 * Postgres double.
 */

import { beforeEach, describe, expect, test } from 'bun:test';
import { app } from '../../../app.ts';
import {
  BILLING_PERIOD,
  PAYMENT_METHOD,
  PLAN,
  SUBSCRIPTION_SOURCE,
} from '../../../lib/constants/plans.ts';
import { inOrder } from '../../../test/fake-postgres.ts';
import { dbControl, resetExternalMocks } from '../../../test/preload.ts';
import { AUTH_HEADER, signedIn, TEST_USER_ID } from '../../../test/session.ts';

beforeEach(() => resetExternalMocks());

const SUBSCRIPTION = {
  id: '3f1c2a64-1b7e-4c55-9d0e-2a7b8c9d0e1f',
  plan: PLAN.plus,
  period: BILLING_PERIOD.monthly,
  source: SUBSCRIPTION_SOURCE.purchase,
  paymentMethod: PAYMENT_METHOD.qris,
  currentPeriodStart: '2026-10-16T05:10:00.000Z',
  currentPeriodEnd: '2026-11-16T05:10:00.000Z',
  cancelAtPeriodEnd: false,
};

function call(method: string, path: string, body?: unknown) {
  return app.request(path, {
    method,
    headers: { 'Content-Type': 'application/json', ...AUTH_HEADER },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

describe('billing routes', () => {
  test('refuse a request without a session', async () => {
    const res = await app.request('/api/plans');

    expect(res.status).toBe(401);
  });

  test('GET /api/plans lists the plans on Kira Gratis', async () => {
    dbControl.respond = signedIn();

    const res = await call('GET', '/api/plans');
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.current).toEqual({ plan: PLAN.free, period: null });
    expect(body.plans).toHaveLength(3);
  });

  test('POST /api/billing/checkout answers the new subscription', async () => {
    dbControl.respond = signedIn(inOrder([{ id: TEST_USER_ID }], [], [SUBSCRIPTION], [], []));

    const res = await call('POST', '/api/billing/checkout', {
      plan: PLAN.plus,
      period: BILLING_PERIOD.monthly,
      paymentMethod: PAYMENT_METHOD.qris,
    });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toMatchObject({ plan: PLAN.plus, price: 29_000, renewsOn: '2026-11-16' });
    expect(body.reminderOn).toBe('2026-11-13');
  });

  test('POST /api/billing/checkout refuses Kira Gratis', async () => {
    dbControl.respond = signedIn();

    const res = await call('POST', '/api/billing/checkout', {
      plan: PLAN.free,
      period: BILLING_PERIOD.monthly,
      paymentMethod: PAYMENT_METHOD.qris,
    });

    expect(res.status).toBe(422);
  });

  test('GET /api/subscription answers 404 on Kira Gratis', async () => {
    dbControl.respond = signedIn();

    const res = await call('GET', '/api/subscription');

    expect(res.status).toBe(404);
    expect((await res.json()).code).toBe('SUBSCRIPTION_NOT_FOUND');
  });

  test('GET /api/subscription answers the plan with its usage', async () => {
    dbControl.respond = signedIn(inOrder([SUBSCRIPTION], []));

    const res = await call('GET', '/api/subscription');

    expect(res.status).toBe(200);
    expect((await res.json()).usage.aiMessages).toEqual({ used: 0, limit: 300 });
  });

  test('POST /api/subscription/cancel refuses a grant with a 409', async () => {
    dbControl.respond = signedIn(
      inOrder([{ ...SUBSCRIPTION, source: SUBSCRIPTION_SOURCE.scholarship }]),
    );

    const res = await call('POST', '/api/subscription/cancel');

    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe('SUBSCRIPTION_NOT_CANCELLABLE');
  });

  test('POST /api/subscription/cancel cancels at period end', async () => {
    dbControl.respond = signedIn(
      inOrder([SUBSCRIPTION], [{ ...SUBSCRIPTION, cancelAtPeriodEnd: true }], []),
    );

    const res = await call('POST', '/api/subscription/cancel');

    expect(res.status).toBe(200);
    expect((await res.json()).cancelAtPeriodEnd).toBe(true);
  });

  test('PUT /api/subscription/payment-method changes the method', async () => {
    dbControl.respond = signedIn(
      inOrder([SUBSCRIPTION], [{ ...SUBSCRIPTION, paymentMethod: PAYMENT_METHOD.appStore }], []),
    );

    const res = await call('PUT', '/api/subscription/payment-method', {
      paymentMethod: PAYMENT_METHOD.appStore,
    });

    expect(res.status).toBe(200);
    expect((await res.json()).paymentMethod).toBe(PAYMENT_METHOD.appStore);
  });

  test('GET /api/billing/invoices lists the invoices', async () => {
    dbControl.respond = signedIn();

    const res = await call('GET', '/api/billing/invoices');

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ items: [] });
  });

  test('POST /api/billing/gifts answers 201 with the amount, and refuses two months', async () => {
    dbControl.respond = signedIn(inOrder([{ id: '5d6e7f80-1a2b-4c3d-8e9f-0a1b2c3d4e5f' }]));

    const res = await call('POST', '/api/billing/gifts', {
      months: 6,
      paymentMethod: PAYMENT_METHOD.qris,
    });
    const refused = await call('POST', '/api/billing/gifts', {
      months: 2,
      paymentMethod: PAYMENT_METHOD.qris,
    });

    expect(res.status).toBe(201);
    expect((await res.json()).amount).toBe(174_000);
    expect(refused.status).toBe(422);
  });

  test('leave the sign-in routes outside the session gate', async () => {
    const res = await app.request('/api/auth/refresh', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: 'nope' }),
    });

    expect((await res.json()).code).toBe('AUTH_REFRESH_INVALID');
  });
});
