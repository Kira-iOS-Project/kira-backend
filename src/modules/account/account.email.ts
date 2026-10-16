/**
 * The account's two emails: Unduh Datamu Dulu (AKN-05), the CSV export as an attachment, and the
 * notice that an account was deleted (AKN-05b). Warm and short, like the sign-in code email, with
 * a plain-text version of each.
 */

import { renderEmail } from '../../lib/email/layout.ts';
import type { EmailMessage } from '../../lib/email/resend.ts';
import { wibDate } from '../../lib/time/wib.ts';
import { wibTime } from './account.csv.ts';

const MONTHS = [
  'Januari',
  'Februari',
  'Maret',
  'April',
  'Mei',
  'Juni',
  'Juli',
  'Agustus',
  'September',
  'Oktober',
  'November',
  'Desember',
];

/** "16 Oktober 2026, 12.41 WIB". */
function wibMoment(instant: Date): string {
  const [year, month = 1, day = 1] = wibDate(instant).split('-').map(Number);
  return `${day} ${MONTHS[month - 1]} ${year}, ${wibTime(instant)} WIB`;
}

export function dataExportEmail(input: {
  to: string;
  name: string;
  fileName: string;
  csv: string;
  rowCount: number;
}): EmailMessage {
  const { html, text } = renderEmail({
    preheader: 'Salinan catatanmu ada di lampiran, dalam format CSV.',
    header: { image: 'header-export', alt: 'Kira · Salinan datamu' },
    heading: 'Ini Salinan Datamu',
    intro: `Hai ${input.name}, sesuai permintaanmu, semua catatan transaksimu di Kira ada di file terlampir.`,
    blocks: [
      {
        kind: 'facts',
        rows: [
          { label: 'Nama file', value: input.fileName },
          {
            label: 'Isi',
            value: `${new Intl.NumberFormat('id-ID').format(input.rowCount)} catatan transaksi`,
          },
        ],
      },
      {
        kind: 'notice',
        icon: 'file',
        title: 'Simpan di Tempat yang Aman',
        text: 'File ini berisi catatan keuanganmu. Teruskan hanya ke orang yang kamu percaya.',
      },
      {
        kind: 'paragraph',
        text: 'Bukan kamu yang meminta? Kabari kami di privasi@kira.id, kami bantu cek akunmu.',
      },
    ],
    footnote: `Email ini dikirim ke ${input.to} karena ada permintaan unduh data dari aplikasi Kira. Email otomatis, tidak perlu dibalas.`,
  });
  return {
    to: input.to,
    subject: 'Salinan datamu dari Kira',
    html,
    text,
    attachments: [{ filename: input.fileName, content: Buffer.from(input.csv).toString('base64') }],
  };
}

export function accountDeletedEmail(input: { to: string; name: string; now: Date }): EmailMessage {
  const { html, text } = renderEmail({
    preheader: 'Akun dan semua datamu di Kira sudah dihapus.',
    header: { image: 'header-deletion', alt: 'Kira · Akun dihapus' },
    heading: 'Akunmu Sudah Dihapus',
    intro: `Hai ${input.name}, sesuai permintaanmu, akun Kira dan semua datamu sudah kami hapus permanen.`,
    blocks: [
      { kind: 'facts', rows: [{ label: 'Dihapus pada', value: wibMoment(input.now) }] },
      {
        kind: 'notice',
        icon: 'shield',
        title: 'Langganan Ikut Berhenti',
        text: 'Langganan aktifmu dibatalkan otomatis. Kamu tidak akan ditagih lagi.',
      },
      {
        kind: 'paragraph',
        text: 'Terima kasih sudah mencoba Kira. Kalau suatu hari ingin kembali, kamu bisa daftar lagi kapan saja.',
      },
      {
        kind: 'paragraph',
        text: 'Bukan kamu yang menghapus? Kabari kami di bantuan@kira.id.',
      },
    ],
    footnote: `Email ini dikirim ke ${input.to} sebagai bukti akun Kira-mu sudah dihapus. Email otomatis, tidak perlu dibalas.`,
  });
  return { to: input.to, subject: 'Akun Kira-mu sudah dihapus', html, text };
}
