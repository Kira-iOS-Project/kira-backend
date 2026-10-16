/**
 * The transaction routes through the real app, the session gate and the shared Postgres double.
 */

import { beforeEach, describe, expect, test } from 'bun:test';
import { app } from '../../../app.ts';
import {
  EXPENSE_CATEGORY,
  INCOME_CATEGORY,
  TRANSACTION_TYPE,
} from '../../../lib/constants/money.ts';
import { inOrder } from '../../../test/fake-postgres.ts';
import { dbControl, resetExternalMocks } from '../../../test/preload.ts';
import { AUTH_HEADER, signedIn } from '../../../test/session.ts';
import { CLIENT_ID, createManualMessageMock, createTransactionRowMock, TX_ID } from './helpers.ts';

beforeEach(() => resetExternalMocks());

function send(method: string, path: string, body?: unknown) {
  return app.request(path, {
    method,
    headers: { 'Content-Type': 'application/json', ...AUTH_HEADER },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

const transaction = createTransactionRowMock();
const row = { ...transaction, occurredAt: transaction.occurredAt.toISOString() };
const message = createManualMessageMock();
const manual = {
  clientId: CLIENT_ID,
  type: TRANSACTION_TYPE.expense,
  amount: 18_000,
  category: EXPENSE_CATEGORY.transport,
  name: 'Grab ke Kantor',
  occurredAt: '2026-10-16T12:41:00+07:00',
};

describe('POST /api/transactions', () => {
  test('answers 201 with the entry and its chat note', async () => {
    dbControl.respond = signedIn(
      inOrder([], [], [row], [{ ...message, createdAt: message.createdAt.toISOString() }]),
    );

    const res = await send('POST', '/api/transactions', manual);

    expect(res.status).toBe(201);
    expect((await res.json()).transaction.id).toBe(TX_ID);
  });

  test('refuses a category from the other direction with a 422', async () => {
    dbControl.respond = signedIn();
    const res = await send('POST', '/api/transactions', {
      ...manual,
      category: INCOME_CATEGORY.salary,
    });
    expect(res.status).toBe(422);
    expect((await res.json()).fields).toHaveProperty('category');
  });
});

describe('GET /api/transactions', () => {
  test('answers a page', async () => {
    dbControl.respond = signedIn(inOrder([row]));
    const res = await send('GET', '/api/transactions?type=expense&limit=5');
    expect(res.status).toBe(200);
    expect((await res.json()).items).toHaveLength(1);
  });
});

describe('GET /api/transactions/summary', () => {
  test('answers the totals, and refuses a backwards range', async () => {
    dbControl.respond = signedIn(inOrder([{ date: '2026-10-16', expense: 18_000, income: 0 }]));
    const res = await send('GET', '/api/transactions/summary?from=2026-10-01&to=2026-10-16');
    expect(await res.json()).toMatchObject({ expense: 18_000, income: 0 });
    expect(
      (await send('GET', '/api/transactions/summary?from=2026-10-16&to=2026-10-01')).status,
    ).toBe(422);
  });
});

describe('/api/transactions/{id}', () => {
  test('answers the detail, an edit and a delete', async () => {
    const detail = {
      ...row,
      spanStart: null,
      spanEnd: null,
      sourceBody: null,
      sourceCreatedAt: null,
    };
    dbControl.respond = signedIn(inOrder([detail], [row], [{ id: TX_ID }]));

    expect((await send('GET', `/api/transactions/${TX_ID}`)).status).toBe(200);
    expect((await send('PATCH', `/api/transactions/${TX_ID}`, { name: 'Ojek' })).status).toBe(200);
    expect((await send('DELETE', `/api/transactions/${TX_ID}`)).status).toBe(204);
  });

  test('answers 404 for an unknown id', async () => {
    dbControl.respond = signedIn();
    const res = await send('DELETE', `/api/transactions/${TX_ID}`);
    expect(res.status).toBe(404);
    expect((await res.json()).code).toBe('TRANSACTION_NOT_FOUND');
  });
});

describe('DELETE /api/transactions/batches/{batchId}', () => {
  test('answers 404 for an unknown batch', async () => {
    dbControl.respond = signedIn();
    const res = await send('DELETE', `/api/transactions/batches/${TX_ID}`);
    expect(res.status).toBe(404);
    expect((await res.json()).code).toBe('TRANSACTION_BATCH_NOT_FOUND');
  });
});
