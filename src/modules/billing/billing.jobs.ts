/**
 * The billing jobs the scheduler runs every hour (src/lib/server/scheduler.ts): the renewal
 * reminder email, and the end of each run-out period (ended, or renewed by the simulation).
 */

import { type EmailMessage, sendEmail } from '../../lib/email/resend.ts';
import { logger } from '../../lib/server/logger.ts';
import { addDays, wibDate, wibStartOfDay } from '../../lib/time/wib.ts';
import { renewalReminderEmail } from './billing.email.ts';
import { type BillingJobsRepository, billingJobsRepository } from './billing-jobs.repository.ts';
import { priceOf, REMINDER_DAYS_BEFORE } from './billing.service.ts';

/** Rows one run handles; the next hour picks up the rest. */
const BATCH_SIZE = 100;

type BillingJobDeps = {
  repository?: BillingJobsRepository;
  send?: (message: EmailMessage) => Promise<void>;
};

/** Emails every bought plan that renews within three days, once per period. */
export async function sendRenewalReminders(
  now: Date,
  deps: BillingJobDeps = {},
): Promise<{ sent: number; failed: number }> {
  const repository = deps.repository ?? billingJobsRepository;
  const send = deps.send ?? sendEmail;
  /** Renewing on or before today + 3 (WIB): before the start of the day after that. */
  const before = wibStartOfDay(addDays(wibDate(now), REMINDER_DAYS_BEFORE + 1));
  const due = await repository.findDueReminders(now, before, BATCH_SIZE);
  const results = await Promise.allSettled(
    due.map((row) =>
      send(
        renewalReminderEmail({
          to: row.email,
          name: row.displayName,
          plan: row.plan,
          period: row.period,
          paymentMethod: row.paymentMethod,
          renewsOn: wibDate(row.currentPeriodEnd),
        }),
      ),
    ),
  );
  const sent = due.filter((_, index) => results[index]?.status === 'fulfilled');
  for (const result of results) {
    if (result.status === 'rejected') {
      logger.error({ err: result.reason }, 'Renewal reminder email failed');
    }
  }
  await repository.markRemindersSent(
    sent.map((row) => row.subscriptionId),
    now,
  );
  return { sent: sent.length, failed: due.length - sent.length };
}

/** Ends cancelled and granted plans whose period ran out, and renews the rest (simulated). */
export async function rollOverPeriods(
  now: Date,
  deps: BillingJobDeps = {},
): Promise<{ ended: number; renewed: number }> {
  const repository = deps.repository ?? billingJobsRepository;
  const ended = await repository.endFinishedPeriods(now);
  const renewed = await repository.renewDuePeriods(now, BATCH_SIZE, priceOf);
  return { ended, renewed };
}
