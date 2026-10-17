import { describe, expect, test } from 'bun:test';
import { EXPENSE_CATEGORY } from '../../../lib/constants/money.ts';
import { BILL_REPEAT_INTERVAL } from '../../../lib/constants/ung.ts';
import { createFakeDb } from '../../../test/fake-postgres.ts';
import { createBillRepository } from '../finance.repository.bills.ts';

const BILL_ID = '00000000-0000-4000-8000-000000000001';

function row(overrides: Record<string, unknown> = {}) {
  return {
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
    ...overrides,
  };
}

describe('bill edit repository', () => {
  test('gets an active schedule scoped to its owner', async () => {
    const fake = createFakeDb((query) =>
      query.sql.includes('from "recurring_bills"') ? [row()] : [],
    );

    await expect(createBillRepository(fake.db).getBill('owner', BILL_ID)).resolves.toMatchObject({
      id: BILL_ID,
      paidThisPeriod: false,
    });
    expect(fake.queries[0]?.sql).toContain('"user_id" =');
    expect(fake.queries[0]?.sql).toContain('"archived_at" is null');
  });

  test('updates future schedule fields without changing saved payment rows', async () => {
    const fake = createFakeDb((query) => {
      if (query.sql.startsWith('select') && query.sql.includes('from "recurring_bills"'))
        return [row()];
      if (query.sql.startsWith('update "recurring_bills"'))
        return [row({ name: 'Internet Baru', amount: 325_000, nextDueDate: '2026-10-25' })];
      return [];
    });

    await expect(
      createBillRepository(fake.db).updateBill('owner', BILL_ID, {
        name: 'Internet Baru',
        amount: 325_000,
        nextDueDate: '2026-10-25',
      }),
    ).resolves.toMatchObject({
      id: BILL_ID,
      name: 'Internet Baru',
      amount: 325_000,
      nextDueDate: '2026-10-25',
    });
    expect(fake.queries).toHaveLength(2);
    expect(fake.queries[0]?.sql).toContain('"user_id" =');
    expect(fake.queries[1]?.sql).toContain('update "recurring_bills"');
    expect(fake.queries[1]?.sql).toContain('"user_id" =');
    expect(fake.queries.some(({ sql }) => /update "(bill_payments|transactions)"/.test(sql))).toBe(
      false,
    );
  });

  test('refuses replacing a debt link with an account owned by someone else', async () => {
    const fake = createFakeDb((query) => {
      if (query.sql.includes('from "recurring_bills"')) return [row()];
      return [];
    });

    await expect(
      createBillRepository(fake.db).updateBill('owner', BILL_ID, {
        linkedDebtAccountId: '00000000-0000-4000-8000-000000000002',
      }),
    ).resolves.toBeNull();
    expect(fake.queries).toHaveLength(2);
    expect(fake.queries[1]?.sql).toContain('from "debt_accounts"');
    expect(fake.queries[1]?.sql).toContain('"user_id" =');
    expect(fake.queries.some(({ sql }) => sql.startsWith('update "recurring_bills"'))).toBe(false);
  });

  test('links an owned debt and initializes its installment count', async () => {
    const debtId = '00000000-0000-4000-8000-000000000002';
    const fake = createFakeDb((query) => {
      if (query.sql.startsWith('select') && query.sql.includes('from "recurring_bills"'))
        return [row()];
      if (query.sql.includes('from "debt_accounts"')) return [{ name: 'Paylater', tenor: 4 }];
      if (query.sql.startsWith('update "recurring_bills"'))
        return [
          row({
            category: EXPENSE_CATEGORY.paylaterInstalment,
            linkedDebtAccountId: debtId,
            linkedDebtName: 'Paylater',
            installmentsTotal: 4,
            installmentsRemaining: 4,
          }),
        ];
      return [];
    });

    await expect(
      createBillRepository(fake.db).updateBill('owner', BILL_ID, { linkedDebtAccountId: debtId }),
    ).resolves.toMatchObject({
      linkedDebtAccountId: debtId,
      installmentsTotal: 4,
      installmentsRemaining: 4,
    });
    expect(fake.queries).toHaveLength(3);
    expect(fake.queries[2]?.sql).toContain('update "recurring_bills"');
  });

  test('supports explicitly removing a debt installment link', async () => {
    const linked = row({
      linkedDebtAccountId: '00000000-0000-4000-8000-000000000002',
      linkedDebtName: 'Paylater',
      installmentsTotal: 10,
      installmentsRemaining: 4,
    });
    const fake = createFakeDb((query) => {
      if (query.sql.startsWith('select') && query.sql.includes('from "recurring_bills"'))
        return [linked];
      if (query.sql.startsWith('update "recurring_bills"')) return [row()];
      return [];
    });

    await expect(
      createBillRepository(fake.db).updateBill('owner', BILL_ID, { linkedDebtAccountId: null }),
    ).resolves.toMatchObject({ linkedDebtAccountId: null, installmentsTotal: null });
    expect(fake.queries).toHaveLength(2);
  });
});
