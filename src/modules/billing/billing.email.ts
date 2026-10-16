/**
 * Email Pengingat Perpanjangan (AKN-06e, AKN-07): three days before a bought plan renews, what it
 * costs, when, and how to stop it. Payments are simulated in this release, and the email says so.
 */

import { BILLING_PERIOD, PAYMENT_METHOD, PLAN, PLAN_TERMS } from '../../lib/constants/plans.ts';
import { longDate, rupiah } from '../../lib/email/format.ts';
import { renderEmail } from '../../lib/email/layout.ts';
import type { EmailMessage } from '../../lib/email/resend.ts';
import type { PlanId } from '../../lib/usage/plan-usage.ts';
import type { BillingPeriod, PaymentMethod } from './billing.schema.ts';

export const PLAN_NAME: Record<PlanId, string> = {
  [PLAN.free]: 'Kira Gratis',
  [PLAN.young]: 'Kira Muda',
  [PLAN.plus]: 'Kira Plus',
};

const PERIOD_NAME: Record<BillingPeriod, string> = {
  [BILLING_PERIOD.monthly]: 'Bulanan',
  [BILLING_PERIOD.yearly]: 'Tahunan',
};

const PAYMENT_METHOD_NAME: Record<PaymentMethod, string> = {
  [PAYMENT_METHOD.qris]: 'QRIS',
  [PAYMENT_METHOD.appStore]: 'App Store',
};

export function renewalReminderEmail(input: {
  to: string;
  name: string;
  plan: PlanId;
  period: BillingPeriod;
  paymentMethod: PaymentMethod | null;
  renewsOn: string;
}): EmailMessage {
  const plan = PLAN_NAME[input.plan];
  const date = longDate(input.renewsOn);
  const terms = PLAN_TERMS[input.plan];
  const price = input.period === BILLING_PERIOD.yearly ? terms.yearlyPrice : terms.monthlyPrice;
  const { html, text } = renderEmail({
    preheader: `${plan} diperpanjang otomatis pada ${date}. Batalkan kapan saja di aplikasi.`,
    header: { image: 'header-renewal', alt: 'Kira · Pengingat perpanjangan' },
    heading: 'Langgananmu Segera Diperpanjang',
    intro: `Hai ${input.name}, langganan ${plan} kamu diperpanjang otomatis 3 hari lagi.`,
    blocks: [
      {
        kind: 'facts',
        rows: [
          { label: 'Paket', value: `${plan} · ${PERIOD_NAME[input.period]}` },
          { label: 'Biaya', value: rupiah(price) },
          { label: 'Tanggal Perpanjangan', value: date },
          {
            label: 'Metode Pembayaran',
            value: PAYMENT_METHOD_NAME[input.paymentMethod ?? PAYMENT_METHOD.qris],
          },
        ],
      },
      {
        kind: 'notice',
        icon: 'calendar',
        title: 'Kuota Terisi Lagi',
        text: 'Kuota chat AI, scan struk, dan input suara terisi lagi pada tanggal perpanjangan.',
      },
      {
        kind: 'paragraph',
        text: 'Mau berhenti? Buka Profil, lalu Langganan, dan ketuk Batalkan Langganan. Tanpa pertanyaan, dan fiturmu tetap aktif sampai akhir periode.',
      },
      {
        kind: 'paragraph',
        text: 'Catatan prototipe: pembayaran ini hanya simulasi. Tidak ada uang yang ditagih.',
      },
    ],
    footnote: `Email ini dikirim ke ${input.to} karena kamu berlangganan ${plan}. Email otomatis, tidak perlu dibalas.`,
  });
  return { to: input.to, subject: `${plan} diperpanjang ${date}`, html, text };
}
