import { describe, expect, test } from 'bun:test';
import { EXPENSE_CATEGORY } from '../../../lib/constants/money.ts';
import { BILL_REPEAT_INTERVAL } from '../../../lib/constants/ung.ts';
import { createFakeDb } from '../../../test/fake-postgres.ts';
import { createBillRepository } from '../finance.repository.bills.ts';

const BILL_ID = '00000000-0000-4000-8000-000000000001';
const DEBT_BILL_ID = '00000000-0000-4000-8000-000000000002';
const DEBT_ID = '00000000-0000-4000-8000-000000000003';

describe('bill repository', () => {
  test('lists owner schedules in due-date order and marks those paid in the period', async () => {
    const fake = createFakeDb((query) => {
      if (query.sql.includes('from "recurring_bills"'))
        return [
          {
            id: BILL_ID,
            name: 'Internet',
            amount: 300_000,
            category: EXPENSE_CATEGORY.bills,
            nextDueDate: '2026-10-20',
            repeatInterval: BILL_REPEAT_INTERVAL.monthly,
            installmentsTotal: null,
            installmentsRemaining: null,
            linkedDebtAccountId: null,
            linkedDebtName: null,
          },
          {
            id: DEBT_BILL_ID,
            name: 'Cicilan',
            amount: 200_000,
            category: EXPENSE_CATEGORY.paylaterInstalment,
            nextDueDate: '2026-10-25',
            repeatInterval: BILL_REPEAT_INTERVAL.monthly,
            installmentsTotal: 10,
            installmentsRemaining: 4,
            linkedDebtAccountId: DEBT_ID,
            linkedDebtName: 'Paylater',
          },
        ];
      if (query.sql.includes('from "bill_payments"')) return [{ billId: BILL_ID }];
      if (query.sql.includes('from "debt_payments"')) return [{ debtId: DEBT_ID }];
      return [];
    });
    const repository = createBillRepository(fake.db);

    await expect(repository.listBills('owner', '2026-09-25')).resolves.toMatchObject([
      { id: BILL_ID, linkedDebtAccountId: null, paidThisPeriod: true },
      {
        id: DEBT_BILL_ID,
        linkedDebtAccountId: DEBT_ID,
        installmentsTotal: 10,
        installmentsRemaining: 4,
        paidThisPeriod: true,
      },
    ]);
    expect(fake.queries).toHaveLength(3);
    expect(fake.queries[0]?.sql).toContain('order by');
    for (const query of fake.queries) {
      expect(query.sql).toContain('"user_id" =');
      expect(query.sql).toContain('limit');
    }
    expect(fake.queries[2]?.sql).toContain('"paid_at" >=');
  });
});
