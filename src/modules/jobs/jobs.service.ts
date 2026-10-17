/**
 * The scheduled jobs, in the order each hourly run takes them (src/lib/server/scheduler.ts), each
 * behind its own lock so only one process runs a job at a time, and the one job that belongs to no
 * feature: deleting sign-in codes a day after they were sent.
 */

import type { ScheduledJob } from '../../lib/server/scheduler.ts';
import { rollOverPeriods, sendRenewalReminders } from '../billing/index.ts';
import { reviewScholarshipApplications } from '../scholarship/index.ts';
import { takeMonthlySnapshots } from '../score/index.ts';
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

/**
 * The job under its lock, keyed by its name. When another process holds it (an overlapping run
 * during a deploy), this run skips the job quietly: the holder is doing the same work.
 */
export function exclusive(
  name: string,
  run: (now: Date) => Promise<unknown>,
  deps: { repository?: JobsRepository } = {},
): ScheduledJob {
  return {
    name,
    async run(now) {
      const repository = deps.repository ?? jobsRepository;
      const outcome = await repository.withJobLock(name, () => run(now));
      return outcome.ran ? outcome.result : { skipped: 'locked' };
    },
  };
}

/** Periods roll over first, so a renewed plan's reminder is counted from its new period. */
export const scheduledJobs: readonly ScheduledJob[] = [
  exclusive('subscription-rollover', rollOverPeriods),
  exclusive('renewal-reminders', sendRenewalReminders),
  exclusive('scholarship-review', reviewScholarshipApplications),
  exclusive('score-monthly-snapshot', takeMonthlySnapshots),
  exclusive('auth-code-cleanup', deleteStaleAuthCodes),
];
