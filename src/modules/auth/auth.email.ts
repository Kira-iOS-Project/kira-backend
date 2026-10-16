/**
 * Email Kode Verifikasi (ONB-15): the code in the subject so iOS can offer it from Mail, the code
 * again in the body, no button and no link, and a plain-text version.
 */

import type { EmailMessage } from '../../lib/email/resend.ts';
import { renderEmail } from '../../lib/email/layout.ts';

export function loginCodeEmail(input: { to: string; code: string; name: string }): EmailMessage {
  const { html, text } = renderEmail({
    preheader: `Kode ${input.code} berlaku 10 menit. Jangan bagikan ke siapa pun.`,
    header: { image: 'header-code', alt: 'Kira · Kode verifikasi' },
    heading: 'Ini Kode Masukmu',
    intro: `Hai ${input.name}, masukkan kode di bawah ini di aplikasi Kira untuk melanjutkan.`,
    blocks: [
      { kind: 'code', code: input.code, validity: 'Berlaku 10 menit' },
      {
        kind: 'notice',
        icon: 'lock',
        title: 'Jangan Bagikan Kode Ini',
        text: 'Kira tidak pernah meminta kode lewat telepon, chat, atau email, termasuk dari orang yang mengaku tim Kira.',
      },
      {
        kind: 'paragraph',
        text: 'Bukan kamu yang meminta kode ini? Abaikan saja email ini. Akunmu tetap aman dan tidak ada yang berubah.',
      },
    ],
    footnote: `Email ini dikirim ke ${input.to} karena ada permintaan masuk ke Kira. Email otomatis, tidak perlu dibalas.`,
  });
  return { to: input.to, subject: `${input.code} adalah kode masuk Kira`, html, text };
}
