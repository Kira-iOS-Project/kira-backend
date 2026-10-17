import { describe, expect, test } from 'bun:test';
import { EXPENSE_CATEGORY } from '../../../lib/constants/money.ts';
import { BILL_KIND, BILL_REPEAT_INTERVAL } from '../../../lib/constants/ung.ts';
import { getBill, updateBill } from '../finance.bills.service.ts';
import type { BillRow } from '../finance.repository.types.ts';

const now = () => new Date('2026-10-17T05:00:00.000Z');
const bill: BillRow = {
  id: '00000000-0000-4000-8000-000000000001',
  name: 'Internet',
  amount: 300_000,
  category: EXPENSE_CATEGORY.bills,
  nextDueDate: '2026-10-22',
  repeatInterval: BILL_REPEAT_INTERVAL.monthly,
  installmentsTotal: null,
  installmentsRemaining: null,
  linkedDebtAccountId: null,
  linkedDebtName: null,
  paidThisPeriod: false,
};
const budgetRepository = {
  getBudget: async () => ({
    income: 1_000_000,
    allocations: [],
    payday: { type: 'day' as const, day: 25 },
  }),
  getProfileBudget: async () => ({ income: 0, payday: { type: 'endOfMonth' as const } }),
};
const deps = { now, budgetRepository };

describe('bill detail and edit services', () => {
  test('returns an owner-scoped bill with current due status', async () => {
    const result = await getBill('owner', bill.id, {
      ...deps,
      repository: {
        getBill: async (userId, id) => {
          expect(userId).toBe('owner');
          expect(id).toBe(bill.id);
          return bill;
        },
        updateBill: async () => bill,
        listBills: async () => [bill],
      },
    });
    expect(result).toMatchObject({ id: bill.id, kind: BILL_KIND.bill, dueSoon: true });
  });

  test('uses BILL_NOT_FOUND when the schedule is unavailable to the owner', async () => {
    await expect(
      getBill('owner', bill.id, {
        ...deps,
        repository: {
          getBill: async () => null,
          updateBill: async () => bill,
          listBills: async () => [],
        },
      }),
    ).rejects.toMatchObject({ code: 'BILL_NOT_FOUND', statusCode: 404 });
  });

  test('returns the edited schedule with current status and preserved payment state', async () => {
    const updated = { ...bill, name: 'Internet baru', nextDueDate: '2026-10-19' };
    const result = await updateBill(
      'owner',
      bill.id,
      { name: updated.name },
      {
        ...deps,
        repository: {
          getBill: async () => updated,
          updateBill: async (userId, id, body) => {
            expect(userId).toBe('owner');
            expect(id).toBe(bill.id);
            expect(body).toEqual({ name: updated.name });
            return updated;
          },
          listBills: async () => [{ ...updated, paidThisPeriod: true }],
        },
      },
    );
    expect(result).toMatchObject({
      id: bill.id,
      name: updated.name,
      dueSoon: false,
      paidThisPeriod: true,
    });
  });
});
