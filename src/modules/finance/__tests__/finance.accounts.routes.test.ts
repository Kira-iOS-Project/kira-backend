import { beforeEach, describe, expect, test } from 'bun:test';
import { app } from '../../../app.ts';
import { dbControl, resetExternalMocks } from '../../../test/preload.ts';
import { signedIn } from '../../../test/session.ts';
import { DEBT_KIND, DEBT_PAYMENT_STATUS } from '../../../lib/constants/profile.ts';
import { FINANCE_INPUT_ALIAS, WALLET_TYPE } from '../../../lib/constants/ung.ts';

beforeEach(() => resetExternalMocks());

describe('finance account routes', () => {
  test('requires a session and returns only authenticated wallet and debt rows', async () => {
    expect((await app.request('/api/wallets')).status).toBe(401);

    dbControl.respond = signedIn((query) =>
      query.sql.includes('from "wallets"')
        ? [
            {
              id: '00000000-0000-4000-8000-000000000001',
              name: 'Dompet',
              type: WALLET_TYPE.cash,
              balance: 125_000,
              createdAt: new Date('2026-10-16T05:00:00.000Z'),
            },
          ]
        : [
            {
              id: '00000000-0000-4000-8000-000000000002',
              name: 'Paylater',
              kind: DEBT_KIND.paylater,
              originalAmount: 500_000,
              remainingAmount: 350_000,
              monthlyInstallment: 50_000,
              remainingTenorMonths: 7,
              dueDay: 20,
              paymentStatus: DEBT_PAYMENT_STATUS.onTime,
            },
          ],
    );

    const wallets = await app.request('/api/wallets', {
      headers: { Authorization: 'Bearer test-access-token' },
    });
    expect(wallets.status).toBe(200);
    expect(await wallets.json()).toMatchObject({
      heldTotal: 125_000,
      totalDebt: 350_000,
      items: [{ name: 'Dompet' }],
      debts: [{ nextInstallment: { amount: 50_000 }, dueSoon: true }],
    });

    expect((await app.request('/api/debts')).status).toBe(401);
  });

  test('creates an authenticated wallet and normalizes the e-wallet alias', async () => {
    dbControl.respond = signedIn((query) =>
      query.sql.includes('insert into "wallets"')
        ? [
            {
              id: '00000000-0000-4000-8000-000000000003',
              name: 'Jago',
              type: WALLET_TYPE.eWallet,
              balance: 50_000,
              createdAt: new Date('2026-10-16T05:00:00.000Z'),
            },
          ]
        : [],
    );
    const response = await app.request('/api/wallets', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer test-access-token',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ name: 'Jago', type: FINANCE_INPUT_ALIAS.eWallet, balance: 50_000 }),
    });
    expect(response.status).toBe(201);
    expect(await response.json()).toMatchObject({
      name: 'Jago',
      type: WALLET_TYPE.eWallet,
      balance: 50_000,
    });
  });

  test('creates a pinjol debt through the debt endpoint and stores its canonical kind', async () => {
    dbControl.respond = signedIn((query) =>
      query.sql.includes('insert into "debt_accounts"')
        ? [
            {
              id: '00000000-0000-4000-8000-000000000004',
              name: 'Dana Cepat',
              kind: DEBT_KIND.onlineLoan,
              originalAmount: 1_000_000,
              remainingAmount: 1_000_000,
              monthlyInstallment: 100_000,
              remainingTenorMonths: 10,
              dueDay: 20,
              paymentStatus: DEBT_PAYMENT_STATUS.onTime,
            },
          ]
        : [],
    );
    const response = await app.request('/api/debts', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer test-access-token',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: 'Dana Cepat',
        kind: FINANCE_INPUT_ALIAS.pinjol,
        amount: 1_000_000,
        monthlyInstallment: 100_000,
        remainingTenorMonths: 10,
        nextDueDate: '2026-10-20',
      }),
    });
    expect(response.status).toBe(201);
    expect(await response.json()).toMatchObject({
      kind: DEBT_KIND.onlineLoan,
      originalAmount: 1_000_000,
      remainingAmount: 1_000_000,
      installmentsTotal: 10,
      nextInstallment: { dueDate: '2026-10-20', status: 'dueSoon' },
    });
  });
});
