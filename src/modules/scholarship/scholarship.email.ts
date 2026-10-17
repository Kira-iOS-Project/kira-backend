/**
 * Email Hasil Beasiswa Kira (AKN-10b, AKN-10d): the application was accepted, Kira Plus is on for
 * three months, how to extend it, and that nothing is owed. The only channel for the result
 * besides the status screen: Kira sends no app notifications.
 */

import { longDate, rupiah } from '../../lib/email/format.ts';
import { renderEmail } from '../../lib/email/layout.ts';
import type { EmailMessage } from '../../lib/email/resend.ts';

export function scholarshipAcceptedEmail(input: {
  to: string;
  name: string;
  grantStart: string;
  grantEnd: string;
  extensionFrom: string;
}): EmailMessage {
  const end = longDate(input.grantEnd);
  const { html, text } = renderEmail({
    preheader: `Kira Plus aktif gratis untukmu sampai ${end}.`,
    header: { image: 'header-scholarship', alt: 'Kira · Beasiswa Kira' },
    heading: 'Beasiswa Kira Diterima',
    intro: `Hai ${input.name}, pengajuanmu diterima. Kira Plus sudah aktif untukmu, gratis.`,
    blocks: [
      {
        kind: 'facts',
        rows: [
          { label: 'Paket', value: 'Kira Plus' },
          { label: 'Berlaku', value: `${longDate(input.grantStart)} sampai ${end}` },
          { label: 'Biaya', value: rupiah(0) },
        ],
      },
      {
        kind: 'notice',
        title: 'Perpanjang 3 Bulan Lagi',
        text: `Kalau masih butuh, ajukan lagi mulai ${longDate(input.extensionFrom)}, paling lama total 6 bulan.`,
      },
      {
        kind: 'notice',
        title: 'Dari Para Penraktir',
        text: 'Beasiswa ini ada karena pengguna lain mentraktir lewat Traktir Kira. Kamu tidak berutang apa pun.',
      },
      {
        kind: 'paragraph',
        text: 'Setelah selesai, akunmu kembali ke Kira Gratis otomatis, tanpa tagihan.',
      },
    ],
    footnote: `Email ini dikirim ke ${input.to} karena kamu mengajukan Beasiswa Kira. Email otomatis, tidak perlu dibalas.`,
  });
  return { to: input.to, subject: 'Beasiswa Kira-mu diterima', html, text };
}
