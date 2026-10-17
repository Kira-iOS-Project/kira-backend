import { beforeEach, describe, expect, test } from 'bun:test';
import { app } from '../../../app.ts';
import { dbControl, resetExternalMocks } from '../../../test/preload.ts';
import { signedIn } from '../../../test/session.ts';

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
              type: 'cash',
              balance: 125_000,
              createdAt: new Date('2026-10-16T05:00:00.000Z'),
            },
          ]
        : [
            {
              id: '00000000-0000-4000-8000-000000000002',
              name: 'Paylater',
              kind: 'paylater',
              originalAmount: 500_000,
              remainingAmount: 350_000,
              monthlyInstallment: 50_000,
              remainingTenorMonths: 7,
              dueDay: 20,
              paymentStatus: 'on_time',
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
});
