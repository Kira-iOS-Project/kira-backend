import { beforeEach, describe, expect, test } from 'bun:test';
import { app } from '../../../app.ts';
import { EXPENSE_CATEGORY } from '../../../lib/constants/money.ts';
import { BILL_KIND, BILL_REPEAT_INTERVAL } from '../../../lib/constants/ung.ts';
import { dbControl, resetExternalMocks } from '../../../test/preload.ts';
import { AUTH_HEADER, signedIn } from '../../../test/session.ts';

beforeEach(() => resetExternalMocks());

describe('bill list route', () => {
  test('requires a session and returns the owner schedule', async () => {
    expect((await app.request('/api/bills')).status).toBe(401);

    dbControl.respond = signedIn(() => []);
    const response = await app.request('/api/bills', { headers: AUTH_HEADER });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ items: [] });
  });

  test('POST /api/bills saves a schedule and returns the due status', async () => {
    let saved = false;
    const schedule = {
      id: '00000000-0000-4000-8000-000000000001',
      name: 'Internet',
      amount: 300_000,
      category: EXPENSE_CATEGORY.bills,
      nextDueDate: '2026-10-22',
      repeatInterval: BILL_REPEAT_INTERVAL.monthly,
      installmentsTotal: null,
      installmentsRemaining: null,
      linkedDebtAccountId: null,
      linkedDebtName: null,
    };
    dbControl.respond = signedIn((query) => {
      if (query.sql.includes('from "recurring_bills"') && query.sql.startsWith('select'))
        return saved ? [schedule] : [];
      if (query.sql.includes('insert into "recurring_bills"')) {
        saved = true;
        return [schedule];
      }
      if (query.sql.includes('from "users"')) return [{ income: 0, paydayDay: null }];
      return [];
    });

    const response = await app.request('/api/bills', {
      method: 'POST',
      headers: { ...AUTH_HEADER, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: ' Internet ',
        amount: 300_000,
        category: EXPENSE_CATEGORY.bills,
        nextDueDate: '2026-10-22',
        repeatInterval: BILL_REPEAT_INTERVAL.monthly,
        clientId: '00000000-0000-4000-8000-000000000004',
      }),
    });

    expect(response.status).toBe(201);
    expect(await response.json()).toMatchObject({
      id: schedule.id,
      name: 'Internet',
      kind: BILL_KIND.bill,
    });
  });

  test('POST /api/bills refuses incomplete or inconsistent installment counts', async () => {
    dbControl.respond = signedIn(() => []);
    const response = await app.request('/api/bills', {
      method: 'POST',
      headers: { ...AUTH_HEADER, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Internet',
        amount: 300_000,
        category: EXPENSE_CATEGORY.bills,
        nextDueDate: '2026-10-22',
        repeatInterval: BILL_REPEAT_INTERVAL.monthly,
        clientId: '00000000-0000-4000-8000-000000000004',
        installmentsTotal: 10,
      }),
    });

    expect(response.status).toBe(422);
  });

  test('POST /api/bills refuses more remaining installments than the total', async () => {
    dbControl.respond = signedIn(() => []);
    const response = await app.request('/api/bills', {
      method: 'POST',
      headers: { ...AUTH_HEADER, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Paylater',
        amount: 300_000,
        category: EXPENSE_CATEGORY.paylaterInstalment,
        nextDueDate: '2026-10-22',
        repeatInterval: BILL_REPEAT_INTERVAL.monthly,
        linkedDebtAccountId: '00000000-0000-4000-8000-000000000003',
        clientId: '00000000-0000-4000-8000-000000000004',
        installmentsTotal: 5,
        installmentsRemaining: 8,
      }),
    });

    expect(response.status).toBe(422);
  });

  test('GET /api/bills/{id} returns a bill owned by the signed-in user', async () => {
    const schedule = {
      id: '00000000-0000-4000-8000-000000000001',
      name: 'Internet',
      amount: 300_000,
      category: EXPENSE_CATEGORY.bills,
      nextDueDate: '2026-10-22',
      repeatInterval: BILL_REPEAT_INTERVAL.monthly,
      installmentsTotal: null,
      installmentsRemaining: null,
      linkedDebtAccountId: null,
      linkedDebtName: null,
    };
    let billReads = 0;
    dbControl.respond = signedIn((query) => {
      if (query.sql.includes('from "recurring_bills"')) {
        billReads += 1;
        return [schedule];
      }
      if (query.sql.includes('from "users"'))
        return [
          {
            income: 1_000_000,
            paydayDay: null,
            createdAt: new Date('2026-01-01T00:00:00Z'),
            essentialMonthlyExpenses: null,
            emergencyFund: null,
            maritalStatus: null,
            dependents: 0,
          },
        ];
      return [];
    });

    const response = await app.request(`/api/bills/${schedule.id}`, { headers: AUTH_HEADER });

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      id: schedule.id,
      name: 'Internet',
      kind: BILL_KIND.bill,
    });
    expect(billReads).toBe(2);
  });

  test('PATCH /api/bills/{id} updates schedule fields and rejects an empty patch', async () => {
    const id = '00000000-0000-4000-8000-000000000001';
    const schedule = {
      id,
      name: 'Internet',
      amount: 300_000,
      category: EXPENSE_CATEGORY.bills,
      nextDueDate: '2026-10-22',
      repeatInterval: BILL_REPEAT_INTERVAL.monthly,
      installmentsTotal: null,
      installmentsRemaining: null,
      linkedDebtAccountId: null,
      linkedDebtName: null,
    };
    let reads = 0;
    dbControl.respond = signedIn((query) => {
      if (query.sql.includes('from "recurring_bills"')) {
        reads += 1;
        return [reads === 1 ? schedule : { ...schedule, name: 'Internet baru' }];
      }
      if (query.sql.startsWith('update "recurring_bills"'))
        return [{ ...schedule, name: 'Internet baru' }];
      if (query.sql.includes('from "users"'))
        return [
          {
            income: 1_000_000,
            paydayDay: null,
            createdAt: new Date('2026-01-01T00:00:00Z'),
            essentialMonthlyExpenses: null,
            emergencyFund: null,
            maritalStatus: null,
            dependents: 0,
          },
        ];
      return [];
    });
    const headers = { ...AUTH_HEADER, 'Content-Type': 'application/json' };
    const response = await app.request(`/api/bills/${id}`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify({ name: 'Internet baru' }),
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ id, name: 'Internet baru' });
    expect(
      (await app.request(`/api/bills/${id}`, { method: 'PATCH', headers, body: '{}' })).status,
    ).toBe(422);
  });
});
