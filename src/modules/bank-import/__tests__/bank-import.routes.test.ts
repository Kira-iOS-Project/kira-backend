/**
 * The bank-import routes through the real app, the session gate and the shared Postgres double.
 */

import { beforeEach, describe, expect, test } from 'bun:test';
import { app } from '../../../app.ts';
import { EXPENSE_CATEGORY, INCOME_CATEGORY } from '../../../lib/constants/money.ts';
import { PLAN, SUBSCRIPTION_SOURCE, SUBSCRIPTION_STATUS } from '../../../lib/constants/plans.ts';
import { inOrder } from '../../../test/fake-postgres.ts';
import { dbControl, resetExternalMocks } from '../../../test/preload.ts';
import { AUTH_HEADER, signedIn } from '../../../test/session.ts';
import { IMPORT_BODY, IMPORT_ID, NOW, ROW_ID } from './helpers.ts';

beforeEach(() => resetExternalMocks());

function post(path: string, body: unknown) {
  return app.request(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...AUTH_HEADER },
    body: JSON.stringify(body),
  });
}

const plus = {
  plan: PLAN.plus,
  source: SUBSCRIPTION_SOURCE.purchase,
  status: SUBSCRIPTION_STATUS.active,
  currentPeriodStart: NOW.toISOString(),
  currentPeriodEnd: NOW.toISOString(),
};

describe('POST /api/imports', () => {
  test('answers 201 with the rows to review on Kira Plus', async () => {
    dbControl.respond = signedIn(inOrder([plus], []));

    const res = await post('/api/imports', IMPORT_BODY);

    expect(res.status).toBe(201);
    expect((await res.json()).rows).toHaveLength(2);
  });

  test('answers 403 on Kira Gratis, and 422 for a category against the sign', async () => {
    dbControl.respond = signedIn();
    expect((await post('/api/imports', IMPORT_BODY)).status).toBe(403);
    const wrong = {
      ...IMPORT_BODY,
      rows: [{ ...IMPORT_BODY.rows[0], category: INCOME_CATEGORY.salary }],
    };
    expect((await post('/api/imports', wrong)).status).toBe(422);
    const zero = { ...IMPORT_BODY, rows: [{ ...IMPORT_BODY.rows[0], amount: 0 }] };
    expect((await post('/api/imports', zero)).status).toBe(422);
  });
});

describe('POST /api/imports/{id}/commit', () => {
  test('answers the stored counts of a committed import', async () => {
    dbControl.respond = signedIn(
      inOrder([{ committedAt: NOW.toISOString(), savedCount: 3, skippedCount: 1 }]),
    );

    const res = await post(`/api/imports/${IMPORT_ID}/commit`, {
      rows: [{ id: ROW_ID, category: EXPENSE_CATEGORY.food }],
    });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ savedCount: 3, skippedCount: 1 });
  });

  test('answers 404 for an unknown import', async () => {
    dbControl.respond = signedIn();
    const res = await post(`/api/imports/${IMPORT_ID}/commit`, { rows: [] });
    expect(res.status).toBe(404);
  });
});
