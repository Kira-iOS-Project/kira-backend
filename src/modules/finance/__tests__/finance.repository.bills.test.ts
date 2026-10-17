import { describe, expect, test } from 'bun:test';
import { createFakeDb } from '../../../test/fake-postgres.ts';
import { createBillRepository } from '../finance.repository.bills.ts';
import { BILL_ID, billRow, DEBT_ID } from './bills.helpers.ts';

/** The bill as the database double answers it: the select's column order, an ISO time. */
function billDbRow() {
  const row = billRow();
  return { ...row, createdAt: row.createdAt.toISOString() };
}

const { id: _id, lastPaidOn: _p, remainingTenorMonths: _t, createdAt: _c, ...NEW_BILL } = billRow();

describe('createBillRepository', () => {
  test("lists the person's bills with their debt's tenor, oldest first", async () => {
    const fake = createFakeDb(() => [billDbRow()]);
    const [bill] = await createBillRepository(fake.db).listBills('user-1');
    expect(bill).toMatchObject({ id: BILL_ID, amount: 350_000 });
    expect(bill?.createdAt).toEqual(billRow().createdAt);
    const sql = fake.queries[0]?.sql ?? '';
    expect(sql).toContain(
      'left join "debt_accounts" on "debt_accounts"."id" = "recurring_bills"."debt_id"',
    );
    expect(sql).toContain('where "recurring_bills"."user_id" = $1');
    expect(sql).toContain('limit $2');
  });

  test('finds one bill of the person, or none', async () => {
    const found = createFakeDb(() => [billDbRow()]);
    expect((await createBillRepository(found.db).findBill('user-1', BILL_ID))?.id).toBe(BILL_ID);
    expect(found.queries[0]?.params).toEqual(['user-1', BILL_ID, 1]);
    const none = createFakeDb(() => []);
    expect(await createBillRepository(none.db).findBill('user-1', BILL_ID)).toBeNull();
  });

  test('inserts a bill for the person and reads it back', async () => {
    const fake = createFakeDb((query) =>
      query.sql.startsWith('insert') ? [{ id: BILL_ID }] : [billDbRow()],
    );
    const bill = await createBillRepository(fake.db).insertBill('user-1', NEW_BILL);
    expect(bill.id).toBe(BILL_ID);
    expect(fake.queries[0]?.sql).toStartWith('insert into "recurring_bills"');
    expect(fake.queries[0]?.params).toContain('user-1');
  });

  test('fails loudly when the inserted bill cannot be read back', async () => {
    const vanished = createFakeDb((query) =>
      query.sql.startsWith('insert') ? [{ id: BILL_ID }] : [],
    );
    expect(createBillRepository(vanished.db).insertBill('user-1', NEW_BILL)).rejects.toThrow(
      'could not be read back',
    );
    const nothing = createFakeDb(() => []);
    expect(createBillRepository(nothing.db).insertBill('user-1', NEW_BILL)).rejects.toThrow(
      'could not be read back',
    );
  });

  test("updates and deletes only the person's bill and says whether one matched", async () => {
    const hit = createFakeDb(() => [{ id: BILL_ID }]);
    const repository = createBillRepository(hit.db);
    expect(await repository.updateBill('user-1', BILL_ID, { name: 'Wifi' })).toBe(true);
    expect(await repository.deleteBill('user-1', BILL_ID)).toBe(true);
    expect(hit.queries[0]?.sql).toStartWith('update "recurring_bills"');
    expect(hit.queries[0]?.sql).toContain('where ("recurring_bills"."user_id" = $');
    expect(hit.queries[1]?.sql).toStartWith('delete from "recurring_bills"');
    const miss = createFakeDb(() => []);
    expect(await createBillRepository(miss.db).updateBill('user-1', BILL_ID, { name: 'X' })).toBe(
      false,
    );
    expect(await createBillRepository(miss.db).deleteBill('user-1', BILL_ID)).toBe(false);
  });

  test("checks that a debt is the person's", async () => {
    const owned = createFakeDb(() => [{ id: DEBT_ID }]);
    expect(await createBillRepository(owned.db).ownsDebt('user-1', DEBT_ID)).toBe(true);
    expect(owned.queries[0]?.sql).toContain('"debt_accounts"."user_id" = $1');
    const other = createFakeDb(() => []);
    expect(await createBillRepository(other.db).ownsDebt('user-1', DEBT_ID)).toBe(false);
  });

  test("answers each of the person's debts with its last payment, skipping none", async () => {
    const paidAt = '2026-10-16T20:00:00.000Z';
    const fake = createFakeDb(() => [
      { debtId: DEBT_ID, paidAt },
      { debtId: 'empty', paidAt: null },
    ]);
    expect(await createBillRepository(fake.db).lastDebtPayments('user-1')).toEqual([
      { debtId: DEBT_ID, paidAt: new Date(paidAt) },
    ]);
    const sql = fake.queries[0]?.sql ?? '';
    expect(sql).toContain('max("paid_at") from "debt_payments"');
    expect(sql).toContain('group by "debt_payments"."debt_id"');
  });
});
