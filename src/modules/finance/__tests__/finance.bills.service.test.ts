import { describe, expect, test } from 'bun:test';
import { BILL_GROUP, BILL_KIND, BILL_REPEAT } from '../../../lib/constants/ung.ts';
import { EXPENSE_CATEGORY } from '../../../lib/constants/money.ts';
import { createBill, deleteBill, listBills, updateBill } from '../finance.bills.service.ts';
import type { BillPatch } from '../finance.repository.bills.ts';
import { BILL_ID, billRepositoryMock, billRow, DEBT_ID, MOTOR, NOW } from './bills.helpers.ts';

const now = () => NOW;
const BODY = {
  name: 'Internet Rumah',
  amount: 350_000,
  isEstimate: false,
  category: EXPENSE_CATEGORY.bills,
  repeats: BILL_REPEAT.monthly,
  dueOn: '2026-09-22',
  debtId: null,
};

describe('listBills', () => {
  test('groups the bills, counts the recurring ones and totals a month', async () => {
    const repository = billRepositoryMock({
      listBills: async () => [
        MOTOR,
        billRow(),
        billRow({
          id: 'b2',
          name: 'Asuransi',
          amount: 1_200_000,
          repeats: BILL_REPEAT.yearly,
          dueOn: '2025-12-01',
        }),
        billRow({
          id: 'b3',
          name: 'Servis',
          amount: 500_000,
          repeats: BILL_REPEAT.once,
          dueOn: '2026-10-01',
          lastPaidOn: '2026-10-01',
        }),
      ],
      lastDebtPayments: async () => [
        { debtId: DEBT_ID, paidAt: new Date('2026-10-16T20:00:00.000Z') },
      ],
    });
    const list = await listBills('user-1', { repository, now });
    expect(list.count).toBe(3);
    expect(list.monthlyTotal).toBe(910_000 + 350_000 + 100_000);
    expect(
      list.sections.map(({ group, bills }) => [group, bills.map((bill) => bill.name)]),
    ).toEqual([
      [BILL_GROUP.next7Days, ['Internet Rumah']],
      [BILL_GROUP.nextMonth, ['Cicilan Motor']],
      [BILL_GROUP.later, ['Asuransi']],
    ]);
    const motor = list.sections[1]?.bills[0];
    expect(motor).toMatchObject({
      kind: BILL_KIND.instalment,
      remainingInstalments: 14,
      paidThisPeriod: true,
      nextDueOn: '2026-11-28',
      dueDay: 28,
    });
  });

  test('sorts a section by due date and reads the real clock by default', async () => {
    const repository = billRepositoryMock({
      listBills: async () => [
        billRow({ id: 'b-late', dueOn: '2026-09-24' }),
        billRow({ dueOn: '2026-09-18' }),
      ],
    });
    const list = await listBills('user-1', { repository, now });
    expect(list.sections[0]?.bills.map((bill) => bill.dueOn)).toEqual(['2026-09-18', '2026-09-24']);
    expect((await listBills('user-1', { repository: billRepositoryMock() })).count).toBe(1);
  });
});

describe('createBill', () => {
  test('stores the bill and answers it', async () => {
    const bill = await createBill('user-1', BODY, { repository: billRepositoryMock(), now });
    expect(bill).toMatchObject({
      id: BILL_ID,
      kind: BILL_KIND.bill,
      nextDueOn: '2026-10-22',
      daysUntil: 5,
    });
    expect(bill.remainingInstalments).toBeNull();
  });

  test("links an instalment to the person's own debt and reads its payments", async () => {
    const repository = billRepositoryMock({
      insertBill: async () => MOTOR,
      lastDebtPayments: async () => [{ debtId: 'debt-2', paidAt: NOW }],
    });
    const bill = await createBill('user-1', { ...BODY, debtId: DEBT_ID }, { repository, now });
    expect(bill).toMatchObject({ kind: BILL_KIND.instalment, paidThisPeriod: false });
  });

  test("refuses a debt that is not the person's", async () => {
    const repository = billRepositoryMock({ ownsDebt: async () => false });
    expect(
      createBill('user-1', { ...BODY, debtId: DEBT_ID }, { repository, now }),
    ).rejects.toMatchObject({
      code: 'BILL_DEBT_NOT_FOUND',
    });
  });
});

describe('updateBill', () => {
  test('marks it paid through lastPaidOn and passes the other fields on', async () => {
    let patch: BillPatch = {};
    const repository = billRepositoryMock({
      updateBill: async (_user, _id, next) => {
        patch = next;
        return true;
      },
      findBill: async () => billRow({ lastPaidOn: '2026-10-16' }),
    });
    const bill = await updateBill(
      'user-1',
      BILL_ID,
      { paidOn: '2026-10-16', name: 'Wifi' },
      { repository, now },
    );
    expect(patch).toEqual({ name: 'Wifi', lastPaidOn: '2026-10-16' });
    expect(bill).toMatchObject({ paidThisPeriod: true, nextDueOn: '2026-11-22' });
  });

  test('changes fields without touching the payment', async () => {
    let patch: BillPatch = {};
    const repository = billRepositoryMock({
      updateBill: async (_user, _id, next) => {
        patch = next;
        return true;
      },
    });
    await updateBill('user-1', BILL_ID, { amount: 400_000 }, { repository, now });
    expect(patch).toEqual({ amount: 400_000 });
  });

  test('answers BILL_NOT_FOUND when no bill matched or it vanished', async () => {
    const missing = billRepositoryMock({ updateBill: async () => false });
    expect(
      updateBill('user-1', BILL_ID, { name: 'X' }, { repository: missing, now }),
    ).rejects.toMatchObject({
      code: 'BILL_NOT_FOUND',
    });
    const vanished = billRepositoryMock({ findBill: async () => null });
    expect(
      updateBill('user-1', BILL_ID, { name: 'X' }, { repository: vanished, now }),
    ).rejects.toMatchObject({
      code: 'BILL_NOT_FOUND',
    });
  });

  test("refuses a debt that is not the person's", async () => {
    const repository = billRepositoryMock({ ownsDebt: async () => false });
    expect(
      updateBill('user-1', BILL_ID, { debtId: DEBT_ID }, { repository, now }),
    ).rejects.toMatchObject({
      code: 'BILL_DEBT_NOT_FOUND',
    });
  });
});

describe('deleteBill', () => {
  test("deletes the person's bill, BILL_NOT_FOUND otherwise", async () => {
    expect(
      await deleteBill('user-1', BILL_ID, { repository: billRepositoryMock() }),
    ).toBeUndefined();
    const missing = billRepositoryMock({ deleteBill: async () => false });
    expect(deleteBill('user-1', BILL_ID, { repository: missing })).rejects.toMatchObject({
      code: 'BILL_NOT_FOUND',
    });
  });
});
