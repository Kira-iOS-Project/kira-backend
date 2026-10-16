import { describe, expect, test } from 'bun:test';
import { accountDeletedEmail, dataExportEmail } from '../account.email.ts';
import { NOW } from './helpers.ts';

describe('dataExportEmail', () => {
  test('carries the CSV as a base64 attachment and its own header image', () => {
    const message = dataExportEmail({
      to: 'dinda@email.com',
      name: 'Dinda',
      fileName: 'kira-data-2026-10-16.csv',
      csv: 'Tanggal\r\n',
      rowCount: 1250,
    });

    expect(message.subject).toBe('Salinan datamu dari Kira');
    expect(message.html).toContain('/email/header-export.png');
    expect(message.text).toContain('Hai Dinda');
    expect(message.text).toContain('1.250 catatan transaksi');
    expect(message.attachments).toEqual([
      {
        filename: 'kira-data-2026-10-16.csv',
        content: Buffer.from('Tanggal\r\n').toString('base64'),
      },
    ]);
  });
});

describe('accountDeletedEmail', () => {
  test('names the moment of deletion in WIB', () => {
    const message = accountDeletedEmail({ to: 'dinda@email.com', name: 'Dinda', now: NOW });

    expect(message.subject).toBe('Akun Kira-mu sudah dihapus');
    expect(message.html).toContain('/email/header-deletion.png');
    expect(message.text).toContain('Dihapus pada: 16 Oktober 2026, 12.41 WIB');
    expect(message.attachments).toBeUndefined();
  });
});
