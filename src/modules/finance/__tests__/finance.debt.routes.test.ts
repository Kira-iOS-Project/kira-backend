import { beforeEach, describe, expect, test } from 'bun:test';
import { DEBT_KIND, DEBT_PAYMENT_STATUS } from '../../../lib/constants/profile.ts';
import { app } from '../../../app.ts';
import { dbControl, resetExternalMocks } from '../../../test/preload.ts';
import { AUTH_HEADER, signedIn } from '../../../test/session.ts';

beforeEach(() => resetExternalMocks());

const ID = '00000000-0000-4000-8000-0000000000a1';
const request = (path: string) => app.request(path, { headers: AUTH_HEADER });

describe('GET /api/debts/{id}', () => {
  test('answers 401 without a session', async () => {
    expect((await app.request(`/api/debts/${ID}`)).status).toBe(401);
  });

  test("answers 404 PAYOFF_DEBT_NOT_FOUND for an account that is not the person's", async () => {
    dbControl.respond = signedIn();
    const res = await request(`/api/debts/${ID}`);
    expect(res.status).toBe(404);
    expect((await res.json()).code).toBe('PAYOFF_DEBT_NOT_FOUND');
  });

  test('refuses an id that is not a uuid with a 422', async () => {
    dbControl.respond = signedIn();
    expect((await request('/api/debts/abc')).status).toBe(422);
  });

  test('answers the account', async () => {
    const debt = {
      id: ID,
      name: 'KPR',
      kind: DEBT_KIND.mortgage,
      originalAmount: 100,
      remainingAmount: 50,
      monthlyInstalment: 60,
      remainingTenorMonths: 1,
      dueDay: 5,
      paymentStatus: DEBT_PAYMENT_STATUS.onTime,
    };
    dbControl.respond = signedIn((query) =>
      query.sql.includes('from "debt_accounts"') ? [debt] : [],
    );
    const res = await request(`/api/debts/${ID}`);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      id: ID,
      paidAmount: 50,
      payments: [],
      nextStep: null,
    });
  });
});
