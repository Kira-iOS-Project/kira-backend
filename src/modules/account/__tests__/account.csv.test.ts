import { describe, expect, test } from 'bun:test';
import {
  EXPENSE_CATEGORY,
  INCOME_CATEGORY,
  TRANSACTION_SOURCE,
  TRANSACTION_TYPE,
} from '../../../lib/constants/money.ts';
import { exportFileName, transactionsCsv, wibTime } from '../account.csv.ts';
import { NOW } from './helpers.ts';

describe('transactionsCsv', () => {
  test('writes the Indonesian header and one WIB-dated line per transaction', () => {
    const csv = transactionsCsv([
      {
        occurredAt: NOW,
        type: TRANSACTION_TYPE.expense,
        category: EXPENSE_CATEGORY.household,
        name: 'Sabun, Sampo',
        amount: 42_500,
        source: TRANSACTION_SOURCE.receipt,
        note: 'kata "promo"',
      },
      {
        occurredAt: new Date('2026-10-24T18:30:00.000Z'),
        type: TRANSACTION_TYPE.income,
        category: INCOME_CATEGORY.salary,
        name: '=HYPERLINK("x")',
        amount: 6_500_000,
        source: TRANSACTION_SOURCE.bankImport,
        note: null,
      },
    ]);

    expect(csv.startsWith('﻿')).toBe(true);
    expect(csv.slice(1).split('\r\n')).toEqual([
      'Tanggal,Jam,Jenis,Kategori,Nama,Nominal,Sumber,Catatan',
      '2026-10-16,12.41,Pengeluaran,Rumah Tangga,"Sabun, Sampo",42500,Struk,"kata ""promo"""',
      `2026-10-25,01.30,Pemasukan,Gaji,"'=HYPERLINK(""x"")",6500000,Impor,`,
      '',
    ]);
  });

  test('an empty history is the header alone', () => {
    expect(transactionsCsv([])).toBe('﻿Tanggal,Jam,Jenis,Kategori,Nama,Nominal,Sumber,Catatan\r\n');
  });
});

describe('names and times', () => {
  test('dates the file by the WIB day and writes the WIB clock', () => {
    expect(exportFileName(new Date('2026-10-16T17:30:00.000Z'))).toBe('kira-data-2026-10-17.csv');
    expect(wibTime(NOW)).toBe('12.41');
  });
});
