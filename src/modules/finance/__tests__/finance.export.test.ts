import { describe, expect, test } from 'bun:test';
import { DEBT_KIND, DEBT_PAYMENT_STATUS } from '../../../lib/constants/profile.ts';
import { WALLET_TYPE } from '../../../lib/constants/ung.ts';
import { financeExportSections } from '../finance.export.ts';
import type { FinanceRepository } from '../finance.repository.ts';

function repository(overrides: Partial<FinanceRepository> = {}): FinanceRepository {
  return {
    listWallets: async () => [],
    createWallet: async () => {
      throw new Error('unused');
    },
    listDebts: async () => [],
    createDebt: async () => {
      throw new Error('unused');
    },
    ...overrides,
  } as FinanceRepository;
}

describe('financeExportSections', () => {
  test('nothing to export gives no section', async () => {
    expect(await financeExportSections('user-1', { repository: repository() })).toEqual([]);
  });

  test('exports the wallets and the debt accounts in words', async () => {
    const sections = await financeExportSections('user-1', {
      repository: repository({
        listWallets: async () => [
          {
            id: 'w1',
            name: 'BCA',
            type: WALLET_TYPE.bank,
            balance: 500_000,
            createdAt: new Date('2026-10-01T03:00:00.000Z'),
          },
        ],
        listDebts: async () => [
          {
            id: 'd1',
            name: 'Paylater A',
            kind: DEBT_KIND.paylater,
            originalAmount: 1_260_000,
            remainingAmount: 420_000,
            monthlyInstallment: 210_000,
            remainingTenorMonths: null,
            dueDay: 25,
            paymentStatus: DEBT_PAYMENT_STATUS.late,
          },
        ],
      }),
    });
    expect(sections.map((section) => section.title)).toEqual(['Dompet', 'Dompet · Akun Utang']);
    expect(sections[0]?.rows).toEqual([['BCA', 'Bank', '500000', '2026-10-01']]);
    expect(sections[1]?.rows).toEqual([
      ['Paylater A', 'Paylater', '1260000', '420000', '210000', '', '25', 'Terlambat'],
    ]);
  });
});
