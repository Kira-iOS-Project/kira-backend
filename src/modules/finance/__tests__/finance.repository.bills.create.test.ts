import { describe, expect, test } from 'bun:test';
import { EXPENSE_CATEGORY } from '../../../lib/constants/money.ts';
import { BILL_REPEAT_INTERVAL } from '../../../lib/constants/ung.ts';
import { createFakeDb } from '../../../test/fake-postgres.ts';
import type { CreateBillBody } from '../finance.bills.schema.ts';
import { createBillRepository } from '../finance.repository.bills.ts';

const BILL_ID = '00000000-0000-4000-8000-000000000001';
const DEBT_ID = '00000000-0000-4000-8000-000000000003';
const CLIENT_ID = '00000000-0000-4000-8000-000000000004';
const body: CreateBillBody = {
  name: 'Internet',
  amount: 300_000,
  category: EXPENSE_CATEGORY.bills,
  nextDueDate: '2026-10-20',
  repeatInterval: BILL_REPEAT_INTERVAL.monthly,
  clientId: CLIENT_ID,
};

function schedule(overrides: Record<string, unknown> = {}) {
  return {
    id: BILL_ID,
    name: body.name,
    amount: body.amount,
    category: body.category,
    nextDueDate: body.nextDueDate,
    repeatInterval: body.repeatInterval,
    installmentsTotal: null,
    installmentsRemaining: null,
    linkedDebtAccountId: null,
    linkedDebtName: null,
    ...overrides,
  };
}

describe('bill creation repository', () => {
  test('creates an ordinary bill once per owner and client id', async () => {
    const fake = createFakeDb((query) => {
      if (query.sql.includes('from "recurring_bills"')) return [];
      if (query.sql.includes('insert into "recurring_bills"')) return [schedule()];
      return [];
    });

    await expect(createBillRepository(fake.db).createBill('owner', body)).resolves.toMatchObject({
      id: BILL_ID,
      linkedDebtAccountId: null,
      linkedDebtName: null,
      paidThisPeriod: false,
    });
    expect(fake.queries).toHaveLength(2);
    expect(fake.queries[0]?.sql).toContain('"user_id" =');
    expect(fake.queries[0]?.sql).toContain('"client_id" =');
    expect(fake.queries[1]?.sql).toContain('on conflict');
  });

  test('checks debt ownership and copies remaining tenor to a linked schedule', async () => {
    const fake = createFakeDb((query) => {
      if (query.sql.includes('from "recurring_bills"')) return [];
      if (query.sql.includes('from "debt_accounts"'))
        return [{ id: DEBT_ID, name: 'Paylater', tenor: 4 }];
      if (query.sql.includes('insert into "recurring_bills"'))
        return [
          schedule({
            name: 'Paylater',
            category: EXPENSE_CATEGORY.paylaterInstalment,
            linkedDebtAccountId: DEBT_ID,
            installmentsTotal: 4,
            installmentsRemaining: 4,
          }),
        ];
      return [];
    });

    await expect(
      createBillRepository(fake.db).createBill('owner', {
        ...body,
        name: 'Paylater',
        category: EXPENSE_CATEGORY.paylaterInstalment,
        linkedDebtAccountId: DEBT_ID,
      }),
    ).resolves.toMatchObject({
      installmentsTotal: 4,
      installmentsRemaining: 4,
      linkedDebtName: 'Paylater',
    });
    expect(fake.queries[1]?.sql).toContain('"user_id" =');
    expect(fake.queries[1]?.sql).toContain('for update');
  });

  test('does not create an installment linked to another owner debt', async () => {
    const fake = createFakeDb(() => []);

    await expect(
      createBillRepository(fake.db).createBill('owner', {
        ...body,
        linkedDebtAccountId: DEBT_ID,
      }),
    ).resolves.toBeNull();
    expect(fake.queries).toHaveLength(2);
    expect(fake.queries.some((query) => query.sql.includes('insert into "recurring_bills"'))).toBe(
      false,
    );
  });

  test('returns an existing schedule for a retry without inserting again', async () => {
    const fake = createFakeDb((query) =>
      query.sql.includes('from "recurring_bills"') ? [schedule()] : [],
    );

    await expect(createBillRepository(fake.db).createBill('owner', body)).resolves.toMatchObject({
      id: BILL_ID,
      paidThisPeriod: false,
    });
    expect(fake.queries).toHaveLength(1);
  });

  test('returns a schedule inserted by a concurrent request after a unique conflict', async () => {
    let lookups = 0;
    const fake = createFakeDb((query) => {
      if (query.sql.startsWith('insert into "recurring_bills"')) return [];
      if (query.sql.includes('from "recurring_bills"')) {
        lookups += 1;
        return lookups === 1 ? [] : [schedule()];
      }
      return [];
    });

    await expect(createBillRepository(fake.db).createBill('owner', body)).resolves.toMatchObject({
      id: BILL_ID,
    });
    expect(fake.queries).toHaveLength(3);
  });
});
