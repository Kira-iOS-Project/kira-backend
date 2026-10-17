import { describe, expect, test } from 'bun:test';
import { DEBT_KIND, DEBT_PAYMENT_STATUS } from '../../../lib/constants/profile.ts';
import type { FinanceRepository } from '../finance.repository.types.ts';
import { getDebtDetail } from '../finance.accounts.detail.service.ts';

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
  createdAt: new Date('2026-08-10T00:00:00.000Z'),
};

function repository(overrides: Partial<FinanceRepository> = {}): FinanceRepository {
  return {
    listWallets: async () => [],
    createWallet: async () => {
      throw new Error('unused');
    },
    listDebts: async () => [debt],
    createDebt: async () => {
      throw new Error('unused');
    },
    findDebt: async (_userId, debtId) => (debtId === debt.id ? debt : null),
    listDebtPayments: async () => [],
    ...overrides,
  };
}

const now = () => new Date('2026-10-17T05:00:00.000Z');

describe('getDebtDetail', () => {
  test('returns a monthly schedule, payment history and simulated score', async () => {
    const result = await getDebtDetail('owner', debt.id, {
      repository: repository({
        listDebtPayments: async () => [
          { id: 'payment-1', amount: 100_000, paidAt: new Date('2026-08-18T00:00:00.000Z') },
          { id: 'payment-2', amount: 100_000, paidAt: new Date('2026-09-21T00:00:00.000Z') },
        ],
      }),
      now,
      estimateDebtScore: async () => ({ current: 62, afterPayoff: 67, isSimulated: true }),
    });

    expect(result).toMatchObject({
      totalPaid: 300_000,
      installmentsTotal: 9,
      installmentsRemaining: 7,
      scoreEstimate: { current: 62, afterPayoff: 67, isSimulated: true },
    });
    expect(
      result.installmentSchedule.slice(0, 3).map(({ dueDate, status }) => ({ dueDate, status })),
    ).toEqual([
      { dueDate: '2026-08-20', status: 'paid' },
      { dueDate: '2026-09-20', status: 'paid' },
      { dueDate: '2026-10-20', status: 'dueSoon' },
    ]);
    expect(result.paymentHistory.map(({ onTime }) => onTime)).toEqual([true, false]);
  });

  test('moves the first due date to next month when the account starts after its due day', async () => {
    const result = await getDebtDetail('owner', debt.id, {
      repository: repository({
        findDebt: async () => ({
          ...debt,
          monthlyInstallment: 0,
          remainingAmount: 100_000,
          remainingTenorMonths: 1,
          dueDay: 5,
          createdAt: new Date('2026-10-10T00:00:00.000Z'),
        }),
      }),
      now,
      estimateDebtScore: async () => null,
    });

    expect(result.nextStep).toBe('Tentukan jumlah cicilan agar rencana pelunasan bisa dihitung.');
    expect(result.installmentSchedule).toEqual([
      { dueDate: '2026-11-05', amount: 0, status: 'upcoming' },
    ]);
  });

  test('handles paid debts without a due date or installment history', async () => {
    const result = await getDebtDetail('owner', debt.id, {
      repository: repository({
        findDebt: async () => ({
          ...debt,
          remainingAmount: 0,
          monthlyInstallment: 0,
          remainingTenorMonths: null,
          dueDay: null,
        }),
        listDebtPayments: async () => [
          { id: 'payment-1', amount: 1_000_000, paidAt: new Date('2026-09-21T00:00:00.000Z') },
        ],
      }),
      now,
      estimateDebtScore: async () => null,
    });

    expect(result).toMatchObject({
      installmentsTotal: null,
      installmentSchedule: [],
      paymentHistory: [{ onTime: true }],
      nextStep: 'Utang sudah lunas. Pertahankan kebiasaan mencatat.',
    });
  });

  test('does not reveal another owner debt', async () => {
    await expect(
      getDebtDetail('owner', 'other-owner-debt', {
        repository: repository({ findDebt: async () => null }),
        estimateDebtScore: async () => null,
      }),
    ).rejects.toMatchObject({ code: 'PAYOFF_DEBT_NOT_FOUND' });
  });
});
