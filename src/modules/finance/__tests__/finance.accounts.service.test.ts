import { describe, expect, test } from 'bun:test';
import { DEBT_KIND, DEBT_PAYMENT_STATUS } from '../../../lib/constants/profile.ts';
import { WALLET_TYPE } from '../../../lib/constants/ung.ts';
import { listDebts, listWallets } from '../finance.accounts.service.ts';
import type { FinanceRepository } from '../finance.repository.types.ts';

const wallet = {
  id: '00000000-0000-4000-8000-000000000001',
  name: 'Dompet',
  type: WALLET_TYPE.cash,
  balance: 250_000,
  createdAt: new Date('2026-10-16T05:00:00.000Z'),
};

const debt = {
  id: '00000000-0000-4000-8000-000000000002',
  name: 'Paylater',
  kind: DEBT_KIND.paylater,
  originalAmount: 1_000_000,
  remainingAmount: 700_000,
  monthlyInstallment: 100_000,
  remainingTenorMonths: 7,
  dueDay: 20,
  paymentStatus: DEBT_PAYMENT_STATUS.onTime,
};

function repository(overrides: Partial<FinanceRepository> = {}): FinanceRepository {
  return {
    listWallets: async () => [wallet],
    listDebts: async () => [debt],
    listBills: async () => [],
    createBill: async () => null,
    getBill: async () => null,
    updateBill: async () => null,
    deleteBill: async () => false,
    totals: async () => [],
    categories: async () => [],
    weeklyTotalsForUsers: async () => [],
    weeklyCategoriesForUsers: async () => [],
    optedInUsers: async () => [],
    saveWeeklies: async () => undefined,
    ...overrides,
  };
}

const now = () => new Date('2026-10-17T05:00:00.000Z');

describe('finance account lists', () => {
  test('returns owned wallets and their held total', async () => {
    await expect(listWallets('owner', { repository: repository() })).resolves.toMatchObject({
      heldTotal: 250_000,
      items: [{ id: wallet.id, balance: 250_000 }],
      debts: [{ id: debt.id }],
      totalDebt: 700_000,
    });
    await expect(
      listWallets('owner', { repository: repository({ listWallets: async () => [] }) }),
    ).resolves.toMatchObject({ items: [], heldTotal: 0, debts: [{ id: debt.id }] });
  });

  test('returns installment due soon, rolls past due days forward, clamps short months and handles missing due day', async () => {
    const result = await listDebts('owner', {
      repository: repository({
        listDebts: async () => [
          debt,
          { ...debt, id: 'past', dueDay: 15 },
          { ...debt, id: 'far', dueDay: 31 },
          { ...debt, id: 'unknown', dueDay: null },
        ],
      }),
      now,
    });
    expect(result.totalDebt).toBe(2_800_000);
    expect(result.items.map((item) => item.nextInstallment?.dueDate ?? null)).toEqual([
      '2026-10-20',
      '2026-11-15',
      '2026-10-31',
      null,
    ]);
    expect(result.items[0]).toMatchObject({ dueSoon: true, nextInstallment: { amount: 100_000 } });
    expect(result.items[2]?.dueSoon).toBe(false);
  });
});
