import { describe, expect, test } from 'bun:test';
import { EXPENSE_CATEGORY } from '../../../lib/constants/money.ts';
import { BILL_KIND, BILL_REPEAT_INTERVAL } from '../../../lib/constants/ung.ts';
import { createBill, listBills } from '../finance.bills.service.ts';
import type { BillRow } from '../finance.repository.types.ts';

const now = () => new Date('2026-10-17T05:00:00.000Z');

const baseBill: BillRow = {
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

describe('listBills', () => {
  test('marks bills and debt installments due within their separate windows', async () => {
    let period: string | undefined;
    const result = await listBills('owner', {
      now,
      budgetRepository: {
        getBudget: async () => ({
          income: 1_000_000,
          allocations: [],
          payday: { type: 'day', day: 25 },
        }),
        getProfileBudget: async () => ({ income: 0, payday: { type: 'endOfMonth' } }),
      },
      repository: {
        listBills: async (userId, periodStart) => {
          expect(userId).toBe('owner');
          period = periodStart;
          return [
            baseBill,
            {
              ...baseBill,
              id: '00000000-0000-4000-8000-000000000002',
              name: 'Paylater',
              nextDueDate: '2026-10-27',
              linkedDebtAccountId: '00000000-0000-4000-8000-000000000003',
              linkedDebtName: 'Cicilan',
              installmentsTotal: 10,
              installmentsRemaining: 4,
            },
            {
              ...baseBill,
              id: '00000000-0000-4000-8000-000000000004',
              nextDueDate: '2026-10-21',
              paidThisPeriod: true,
            },
            {
              ...baseBill,
              id: '00000000-0000-4000-8000-000000000005',
              nextDueDate: '2026-10-16',
            },
          ];
        },
      },
    });

    expect(period).toBe('2026-09-25');
    expect(result.items).toMatchObject([
      { kind: BILL_KIND.bill, dueSoon: true, paidThisPeriod: false },
      { kind: BILL_KIND.debtInstallment, dueSoon: true, paidThisPeriod: false },
      { kind: BILL_KIND.bill, dueSoon: false, paidThisPeriod: true },
      { kind: BILL_KIND.bill, dueSoon: false, paidThisPeriod: false },
    ]);
  });

  test('uses profile payday when no budget has been saved', async () => {
    let period: string | undefined;
    const result = await listBills('owner', {
      now,
      budgetRepository: {
        getBudget: async () => null,
        getProfileBudget: async (userId) => {
          expect(userId).toBe('owner');
          return { income: 1_000_000, payday: { type: 'day', day: 5 } };
        },
      },
      repository: {
        listBills: async (_userId, periodStart) => {
          period = periodStart;
          return [];
        },
      },
    });

    expect(period).toBe('2026-10-05');
    expect(result).toEqual({ items: [] });
  });
});

describe('createBill', () => {
  test('returns the saved schedule with the current due and payment status', async () => {
    const linked: BillRow = {
      ...baseBill,
      linkedDebtAccountId: '00000000-0000-4000-8000-000000000003',
      linkedDebtName: 'Paylater',
      installmentsTotal: 8,
      installmentsRemaining: 8,
    };
    const result = await createBill(
      'owner',
      {
        name: 'Paylater',
        amount: 200_000,
        category: EXPENSE_CATEGORY.paylaterInstalment,
        nextDueDate: '2026-10-27',
        repeatInterval: BILL_REPEAT_INTERVAL.monthly,
        linkedDebtAccountId: linked.linkedDebtAccountId,
        clientId: '00000000-0000-4000-8000-000000000006',
      },
      {
        now,
        repository: {
          createBill: async (userId, body) => {
            expect(userId).toBe('owner');
            expect(body.linkedDebtAccountId).toBe(linked.linkedDebtAccountId);
            return linked;
          },
          listBills: async () => [linked],
        },
        budgetRepository: {
          getBudget: async () => ({
            income: 1_000_000,
            allocations: [],
            payday: { type: 'day', day: 25 },
          }),
          getProfileBudget: async () => ({ income: 0, payday: { type: 'endOfMonth' } }),
        },
      },
    );

    expect(result).toMatchObject({
      id: linked.id,
      kind: BILL_KIND.debtInstallment,
      dueSoon: true,
      paidThisPeriod: false,
    });
  });

  test('refuses an unowned or missing debt account', async () => {
    await expect(
      createBill(
        'owner',
        {
          name: 'Uang Cemas',
          amount: 300_000,
          category: EXPENSE_CATEGORY.bills,
          nextDueDate: '2026-10-22',
          repeatInterval: BILL_REPEAT_INTERVAL.monthly,
          linkedDebtAccountId: '00000000-0000-4000-8000-000000000003',
          clientId: '00000000-0000-4000-8000-000000000006',
        },
        {
          repository: {
            createBill: async () => null,
            listBills: async () => [],
          },
        },
      ),
    ).rejects.toMatchObject({ code: 'PAYOFF_DEBT_NOT_FOUND' });
  });
});
