import { describe, expect, test } from 'bun:test';
import { loginCodeEmail } from '../auth.email.ts';

describe('loginCodeEmail', () => {
  const email = loginCodeEmail({ to: 'dinda@email.com', code: '381427', name: 'Dinda' });

  test('puts the code in the subject so iOS can offer it from Mail', () => {
    expect(email.subject).toBe('381427 adalah kode masuk Kira');
    expect(email.to).toBe('dinda@email.com');
  });

  test('greets by name, shows the spaced code and its ten-minute life, and holds no link', () => {
    expect(email.html).toContain(
      'Hai Dinda, masukkan kode di bawah ini di aplikasi Kira untuk melanjutkan.',
    );
    expect(email.html).toContain('381 427');
    expect(email.html).toContain('Berlaku 10 menit');
    expect(email.html).toContain('Jangan Bagikan Kode Ini');
    expect(email.html).not.toContain('<a ');
  });

  test('has a plain-text version naming the address it went to', () => {
    expect(email.text).toContain('381 427');
    expect(email.text).toContain(
      'Email ini dikirim ke dinda@email.com karena ada permintaan masuk ke Kira.',
    );
  });
});
