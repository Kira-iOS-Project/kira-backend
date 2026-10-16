/**
 * The scheduled jobs, in the order each hourly run takes them (src/lib/server/scheduler.ts), and
 * the one that belongs to no feature: deleting sign-in codes a day after they were sent.
 */

import type { ScheduledJob } from '../../lib/server/scheduler.ts';
import { rollOverPeriods, sendRenewalReminders } from '../billing/index.ts';
import { reviewScholarshipApplications } from '../scholarship/index.ts';
import { type JobsRepository, jobsRepository } from './jobs.repository.ts';

/** A code lives ten minutes; a day later it is only a record of an address, so it goes. */
const AUTH_CODE_RETENTION_MS = 24 * 60 * 60 * 1000;

export async function deleteStaleAuthCodes(
  now: Date,
  deps: { repository?: JobsRepository } = {},
): Promise<{ deleted: number; checks: number }> {
  const repository = deps.repository ?? jobsRepository;
  const before = new Date(now.getTime() - AUTH_CODE_RETENTION_MS);
  const [deleted, checks] = await Promise.all([
    repository.deleteAuthCodesCreatedBefore(before),
    repository.deleteSignInChecksCreatedBefore(before),
  ]);
  return { deleted, checks };
}

/** Periods roll over first, so a renewed plan's reminder is counted from its new period. */
export const scheduledJobs: readonly ScheduledJob[] = [
  { name: 'subscription-rollover', run: rollOverPeriods },
  { name: 'renewal-reminders', run: sendRenewalReminders },
  { name: 'scholarship-review', run: reviewScholarshipApplications },
  { name: 'auth-code-cleanup', run: deleteStaleAuthCodes },
];
