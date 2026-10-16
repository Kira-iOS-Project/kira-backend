import { describe, expect, test } from 'bun:test';
import { BILLING_PERIOD, PAYMENT_METHOD, PLAN } from '../../../lib/constants/plans.ts';
import { emailControl, resetExternalMocks } from '../../../test/preload.ts';
import type { DueReminder } from '../billing-jobs.repository.ts';
import { renewalReminderEmail } from '../billing.email.ts';
import { rollOverPeriods, sendRenewalReminders } from '../billing.jobs.ts';
import { createBillingJobsRepositoryMock, NOW } from './helpers.ts';

function reminder(id: string, overrides: Partial<DueReminder> = {}): DueReminder {
  return {
    subscriptionId: id,
    email: `${id}@email.com`,
    displayName: 'Dinda',
    plan: PLAN.plus,
    period: BILLING_PERIOD.monthly,
    paymentMethod: PAYMENT_METHOD.qris,
    currentPeriodEnd: new Date('2026-10-19T05:10:00.000Z'),
    ...overrides,
  };
}

describe('sendRenewalReminders', () => {
  test('claims each due plan before emailing it, and gives back the claim of a failed send', async () => {
    const asked: Date[] = [];
    const claimed: string[] = [];
    const released: [string, Date][] = [];
    const repository = createBillingJobsRepositoryMock({
      findDueReminders: async (now, before, limit) => {
        asked.push(now, before);
        expect(limit).toBe(100);
        return [reminder('a'), reminder('b')];
      },
      claimReminder: async (id, now) => {
        expect(now).toBe(NOW);
        claimed.push(id);
        return true;
      },
      releaseReminder: async (id, now) => {
        released.push([id, now]);
      },
    });
    const subjects: string[] = [];
    const send = async (message: { to: string; subject: string }) => {
      if (message.to.startsWith('b')) throw new Error('refused');
      subjects.push(message.subject);
    };

    const result = await sendRenewalReminders(NOW, { repository, send });

    expect(result).toEqual({ sent: 1, failed: 1 });
    /** Renewing on or before 19 October (WIB): before 20 October 00.00 WIB. */
    expect(asked[1]?.toISOString()).toBe('2026-10-19T17:00:00.000Z');
    expect(claimed).toEqual(['a', 'b']);
    expect(subjects).toEqual(['Kira Plus diperpanjang 19 Oktober 2026']);
    expect(released).toEqual([['b', NOW]]);
  });

  test('sends nothing for a reminder another run claimed first', async () => {
    const sent: string[] = [];
    const repository = createBillingJobsRepositoryMock({
      findDueReminders: async () => [reminder('a'), reminder('b')],
      claimReminder: async (id) => id === 'b',
      releaseReminder: async () => {
        throw new Error('nothing to release');
      },
    });
    const send = async (message: { to: string }) => {
      sent.push(message.to);
    };

    expect(await sendRenewalReminders(NOW, { repository, send })).toEqual({ sent: 1, failed: 0 });
    expect(sent).toEqual(['b@email.com']);
  });

  test('sends through Resend by default', async () => {
    resetExternalMocks();
    const repository = createBillingJobsRepositoryMock({
      findDueReminders: async () => [reminder('a')],
    });

    await sendRenewalReminders(NOW, { repository });

    expect(emailControl.sent).toHaveLength(1);
  });
});

describe('rollOverPeriods', () => {
  test('ends finished plans first, then renews the rest at their price', async () => {
    const order: string[] = [];
    const repository = createBillingJobsRepositoryMock({
      endFinishedPeriods: async () => {
        order.push('end');
        return 2;
      },
      renewDuePeriods: async (_, limit, priceOf) => {
        order.push('renew');
        expect(limit).toBe(100);
        expect(priceOf(PLAN.young, BILLING_PERIOD.yearly)).toBe(150_000);
        return 3;
      },
    });

    expect(await rollOverPeriods(NOW, { repository })).toEqual({ ended: 2, renewed: 3 });
    expect(order).toEqual(['end', 'renew']);
  });
});

describe('renewalReminderEmail', () => {
  const email = renewalReminderEmail({
    to: 'dinda@email.com',
    name: 'Dinda',
    plan: PLAN.young,
    period: BILLING_PERIOD.yearly,
    paymentMethod: null,
    renewsOn: '2027-10-16',
  });

  test('names the plan, the date, the price and the method', () => {
    expect(email.subject).toBe('Kira Muda diperpanjang 16 Oktober 2027');
    expect(email.text).toContain('Paket: Kira Muda · Tahunan');
    expect(email.text).toContain('Biaya: Rp150.000,00');
    expect(email.text).toContain('Metode Pembayaran: QRIS');
    expect(email.html).toContain('/email/header-renewal.png');
  });

  test('says how to cancel and that nothing is charged', () => {
    expect(email.text).toContain('Batalkan Langganan');
    expect(email.text).toContain('Tidak ada uang yang ditagih.');
    expect(email.text).toContain('Email ini dikirim ke dinda@email.com');
  });

  test('names App Store payments', () => {
    const appStore = renewalReminderEmail({
      to: 'dinda@email.com',
      name: 'Dinda',
      plan: PLAN.plus,
      period: BILLING_PERIOD.monthly,
      paymentMethod: PAYMENT_METHOD.appStore,
      renewsOn: '2026-11-16',
    });

    expect(appStore.text).toContain('Metode Pembayaran: App Store');
    expect(appStore.text).toContain('Biaya: Rp29.000,00');
  });
});
