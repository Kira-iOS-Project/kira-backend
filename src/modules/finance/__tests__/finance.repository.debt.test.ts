import { describe, expect, test } from 'bun:test';
import { DEBT_KIND, DEBT_PAYMENT_STATUS } from '../../../lib/constants/profile.ts';
import { createFakeDb } from '../../../test/fake-postgres.ts';
import { createDebtDetailRepository } from '../finance.repository.debt.ts';

describe('createDebtDetailRepository', () => {
  test("reads one of the person's accounts, or none", async () => {
    const row = {
      id: 'd1',
      name: 'Paylater A',
      kind: DEBT_KIND.paylater,
      originalAmount: 1,
      remainingAmount: 1,
      monthlyInstalment: 1,
      remainingTenorMonths: null,
      dueDay: null,
      paymentStatus: DEBT_PAYMENT_STATUS.onTime,
    };
    const fake = createFakeDb(() => [row]);
    expect(await createDebtDetailRepository(fake.db).findDebt('user-1', 'd1')).toEqual(row);
    expect(fake.queries[0]?.sql).toContain('"debt_accounts"."user_id" = $1');
    const empty = createFakeDb(() => []);
    expect(await createDebtDetailRepository(empty.db).findDebt('user-1', 'd1')).toBeNull();
  });

  test("lists the account's payments newest first, scoped to the person", async () => {
    const fake = createFakeDb(() => [
      { id: 'p1', amount: 210_000, paidAt: '2026-09-25T03:00:00.000Z' },
    ]);
    const [payment] = await createDebtDetailRepository(fake.db).listPayments('user-1', 'd1');
    expect(payment?.paidAt).toEqual(new Date('2026-09-25T03:00:00.000Z'));
    const sql = fake.queries[0]?.sql ?? '';
    expect(sql).toContain('"debt_payments"."user_id" = $1');
    expect(sql).toContain('order by "debt_payments"."paid_at" desc');
  });
});
