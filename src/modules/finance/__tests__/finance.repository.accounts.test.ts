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
});
