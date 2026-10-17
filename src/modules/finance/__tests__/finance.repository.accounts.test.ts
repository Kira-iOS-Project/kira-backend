import { describe, expect, test } from 'bun:test';
import { createFakeDb } from '../../../test/fake-postgres.ts';
import { DEBT_KIND, DEBT_PAYMENT_STATUS } from '../../../lib/constants/profile.ts';
import { WALLET_TYPE } from '../../../lib/constants/ung.ts';
import { createFinanceRepository } from '../finance.repository.ts';

const ID = '00000000-0000-4000-8000-000000000001';

describe('finance account repository', () => {
  test('lists wallets and debts scoped to the user with bounded results', async () => {
    const fake = createFakeDb((query) =>
      query.sql.includes('from "wallets"')
        ? [{ id: ID, name: 'Dompet', type: WALLET_TYPE.cash, balance: 500, createdAt: new Date() }]
        : [
            {
              id: ID,
              name: 'Paylater',
              kind: DEBT_KIND.paylater,
              originalAmount: 1000,
              remainingAmount: 800,
              monthlyInstallment: 200,
              remainingTenorMonths: 4,
              dueDay: 20,
              paymentStatus: DEBT_PAYMENT_STATUS.onTime,
            },
          ],
    );
    const repository = createFinanceRepository(fake.db);

    await expect(repository.listWallets('owner')).resolves.toHaveLength(1);
    await expect(repository.listDebts('owner')).resolves.toMatchObject([
      { remainingAmount: 800, dueDay: 20 },
    ]);
    expect(fake.queries).toHaveLength(2);
    for (const query of fake.queries) {
      expect(query.sql).toContain('"user_id" =');
      expect(query.sql).toContain('limit');
    }
  });

  test('creates owned wallets and debt accounts with their persisted finance values', async () => {
    const fake = createFakeDb((query) =>
      query.sql.includes('insert into "wallets"')
        ? [
            {
              id: ID,
              name: 'Cash',
              type: WALLET_TYPE.cash,
              balance: 500,
              createdAt: new Date('2026-10-17T00:00:00.000Z'),
            },
          ]
        : [
            {
              id: ID,
              name: 'Kartu Kredit',
              kind: DEBT_KIND.creditCard,
              originalAmount: 1000,
              remainingAmount: 1000,
              monthlyInstallment: 200,
              remainingTenorMonths: 5,
              dueDay: 20,
              paymentStatus: DEBT_PAYMENT_STATUS.onTime,
            },
          ],
    );
    const repository = createFinanceRepository(fake.db);
    const now = new Date('2026-10-17T00:00:00.000Z');

    await expect(
      repository.createWallet(
        'owner',
        { name: 'Cash', type: WALLET_TYPE.cash, openingBalance: 500 },
        now,
      ),
    ).resolves.toMatchObject({ id: ID, balance: 500 });
    await expect(
      repository.createDebt(
        'owner',
        {
          name: 'Kartu Kredit',
          kind: DEBT_KIND.creditCard,
          amount: 1000,
          monthlyInstallment: 200,
          remainingTenorMonths: 5,
          dueDay: 20,
        },
        now,
      ),
    ).resolves.toMatchObject({ originalAmount: 1000, remainingAmount: 1000, dueDay: 20 });

    expect(fake.queries).toHaveLength(2);
    for (const query of fake.queries) {
      expect(query.sql).toContain('"user_id"');
      expect(query.sql).toContain('returning');
    }
  });

  test('loads debt details and payment history with owner filters and stable order', async () => {
    const createdAt = new Date('2026-08-10T00:00:00.000Z');
    const paidAt = new Date('2026-09-10T00:00:00.000Z');
    const fake = createFakeDb((query) =>
      query.sql.includes('from "debt_accounts"')
        ? [
            {
              id: ID,
              name: 'Paylater',
              kind: DEBT_KIND.paylater,
              originalAmount: 1000,
              remainingAmount: 800,
              monthlyInstallment: 200,
              remainingTenorMonths: 4,
              dueDay: 20,
              paymentStatus: DEBT_PAYMENT_STATUS.onTime,
              createdAt,
            },
          ]
        : [{ id: 'payment-1', amount: 200, paidAt }],
    );
    const repository = createFinanceRepository(fake.db);

    await expect(repository.findDebt('owner', ID)).resolves.toMatchObject({ id: ID, createdAt });
    await expect(await repository.listDebtPayments('owner', ID)).toEqual([
      { id: 'payment-1', amount: 200, paidAt },
    ]);
    expect(fake.queries[0]?.sql).toContain('"user_id" =');
    expect(fake.queries[0]?.sql).toContain('"id" =');
    expect(fake.queries[1]?.sql).toContain('order by "debt_payments"."paid_at"');
    expect(fake.queries[1]?.params).toEqual(expect.arrayContaining(['owner', ID]));
  });
});
