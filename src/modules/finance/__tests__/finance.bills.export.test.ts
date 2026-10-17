import { describe, expect, test } from 'bun:test';
import { BILL_REPEAT } from '../../../lib/constants/ung.ts';
import { billExportSections } from '../finance.bills.export.ts';
import { billRepositoryMock, billRow, MOTOR } from './bills.helpers.ts';

describe('billExportSections', () => {
  test('no bill gives no section', async () => {
    const repository = billRepositoryMock({ listBills: async () => [] });
    expect(await billExportSections('user-1', { repository })).toEqual([]);
  });

  test('exports each bill in words', async () => {
    const repository = billRepositoryMock({
      listBills: async () => [
        billRow({ isEstimate: true, lastPaidOn: '2026-10-16' }),
        { ...MOTOR, repeats: BILL_REPEAT.yearly },
        billRow({ repeats: BILL_REPEAT.once }),
      ],
    });
    const [section] = await billExportSections('user-1', { repository });
    expect(section?.title).toBe('Uang · Tagihan');
    expect(section?.rows).toEqual([
      ['Internet Rumah', 'Tagihan', '350000', 'Ya', 'Bulanan', '2026-09-22', 'Tidak', '2026-10-16'],
      ['Cicilan Motor', 'Transportasi', '910000', 'Tidak', 'Tahunan', '2026-10-28', 'Ya', ''],
      ['Internet Rumah', 'Tagihan', '350000', 'Tidak', 'Sekali', '2026-09-22', 'Tidak', ''],
    ]);
  });
});
