/**
 * The bill routes through the real app, the session gate, request validation, the real error
 * mapper and the shared Postgres double answering by statement.
 */

import { beforeEach, describe, expect, test } from 'bun:test';
import { app } from '../../../app.ts';
import { EXPENSE_CATEGORY, INCOME_CATEGORY } from '../../../lib/constants/money.ts';
import { BILL_KIND, BILL_REPEAT } from '../../../lib/constants/ung.ts';
import type { FakeQuery } from '../../../test/fake-postgres.ts';
import { dbControl, resetExternalMocks } from '../../../test/preload.ts';
import { AUTH_HEADER, signedIn } from '../../../test/session.ts';
import { BILL_ID, billRow, DEBT_ID } from './bills.helpers.ts';

beforeEach(() => resetExternalMocks());

const BODY = {
  name: 'Internet Rumah',
  amount: 350_000,
  category: EXPENSE_CATEGORY.bills,
  repeats: BILL_REPEAT.monthly,
  dueOn: '2026-09-22',
};

function send(method: string, path: string, body?: unknown) {
  return app.request(path, {
    method,
    headers: { 'Content-Type': 'application/json', ...AUTH_HEADER },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

const billDbRow = () => ({ ...billRow(), createdAt: billRow().createdAt.toISOString() });
/** Answers reads of "recurring_bills" with Internet Rumah, inserts and writes with its id. */
const withBill = (query: FakeQuery) => {
  if (query.sql.startsWith('insert into "recurring_bills"')) return [{ id: BILL_ID }];
  if (
    query.sql.startsWith('update "recurring_bills"') ||
    query.sql.startsWith('delete from "recurring_bills"')
  ) {
    return [{ id: BILL_ID }];
  }
  return query.sql.includes('from "recurring_bills"') ? [billDbRow()] : [];
};

describe('the bill routes without a session', () => {
  test.each([
    ['GET', '/api/bills'],
    ['POST', '/api/bills'],
    ['PATCH', `/api/bills/${BILL_ID}`],
    ['DELETE', `/api/bills/${BILL_ID}`],
  ])('%s %s answers 401', async (method, path) => {
    const res = await app.request(path, { method });
    expect(res.status).toBe(401);
    expect((await res.json()).code).toBe('AUTH_UNAUTHENTICATED');
  });
});

describe('GET /api/bills', () => {
  test('answers the sections, the count and the monthly total', async () => {
    dbControl.respond = signedIn(withBill);
    const res = await send('GET', '/api/bills');
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body).toMatchObject({ count: 1, monthlyTotal: 350_000 });
    expect(body.sections[0].bills[0]).toMatchObject({
      id: BILL_ID,
      kind: BILL_KIND.bill,
      dueDay: 22,
    });
  });
});

describe('POST /api/bills', () => {
  test('answers 201 with the saved bill', async () => {
    dbControl.respond = signedIn(withBill);
    const res = await send('POST', '/api/bills', BODY);
    expect(res.status).toBe(201);
    expect((await res.json()).id).toBe(BILL_ID);
  });

  test("answers 404 BILL_DEBT_NOT_FOUND for a debt that is not the person's", async () => {
    dbControl.respond = signedIn();
    const res = await send('POST', '/api/bills', { ...BODY, debtId: DEBT_ID });
    expect(res.status).toBe(404);
    expect((await res.json()).code).toBe('BILL_DEBT_NOT_FOUND');
  });

  test.each([
    ['a blank name', { name: ' ' }],
    ['an amount of 0', { amount: 0 }],
    ['an income category', { category: INCOME_CATEGORY.salary }],
    ['an unknown repeat', { repeats: 'weekly' }],
    ['an impossible date', { dueOn: '2026-02-30' }],
    ['a debt id that is no uuid', { debtId: 'abc' }],
  ])('refuses %s with a 422', async (_, change) => {
    dbControl.respond = signedIn();
    const res = await send('POST', '/api/bills', { ...BODY, ...change });
    expect(res.status).toBe(422);
    expect((await res.json()).code).toBe('VALIDATION_FAILED');
  });
});

describe('PATCH /api/bills/{id}', () => {
  test('answers 200 with the changed bill', async () => {
    dbControl.respond = signedIn(withBill);
    const res = await send('PATCH', `/api/bills/${BILL_ID}`, { paidOn: '2026-10-01' });
    expect(res.status).toBe(200);
    expect((await res.json()).id).toBe(BILL_ID);
  });

  test('answers 404 BILL_NOT_FOUND for a bill the person does not have', async () => {
    dbControl.respond = signedIn();
    const res = await send('PATCH', `/api/bills/${BILL_ID}`, { name: 'Wifi' });
    expect(res.status).toBe(404);
    expect((await res.json()).code).toBe('BILL_NOT_FOUND');
  });

  test.each([
    ['an empty body', {}],
    ['a payment in the future', { paidOn: '2999-01-01' }],
  ])('refuses %s with a 422', async (_, body) => {
    dbControl.respond = signedIn();
    const res = await send('PATCH', `/api/bills/${BILL_ID}`, body);
    expect(res.status).toBe(422);
  });

  test('refuses an id that is no uuid with a 422', async () => {
    dbControl.respond = signedIn();
    expect((await send('PATCH', '/api/bills/abc', { name: 'X' })).status).toBe(422);
  });
});

describe('DELETE /api/bills/{id}', () => {
  test('answers 204, then 404 BILL_NOT_FOUND once it is gone', async () => {
    dbControl.respond = signedIn(withBill);
    expect((await send('DELETE', `/api/bills/${BILL_ID}`)).status).toBe(204);
    dbControl.respond = signedIn();
    const res = await send('DELETE', `/api/bills/${BILL_ID}`);
    expect(res.status).toBe(404);
    expect((await res.json()).code).toBe('BILL_NOT_FOUND');
  });
});
