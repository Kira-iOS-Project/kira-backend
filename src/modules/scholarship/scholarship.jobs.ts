/**
 * The Beasiswa Kira review, simulated (AKN-10b to AKN-10d): every hour, applications open for more
 * than a day are accepted, oldest first, while this month's places last; the rest wait. An
 * accepted application gets three months of Kira Plus and the result by email. Each acceptance
 * stands alone, so one that fails holds up no other; a result email that fails goes again on the
 * next run.
 */

import { APPLICATION_STATUS } from '../../lib/constants/scholarship.ts';
import { type EmailMessage, sendEmail } from '../../lib/email/resend.ts';
import { logger } from '../../lib/server/logger.ts';
import { addMonthsToInstant } from '../../lib/time/instant.ts';
import { addDays, wibDate } from '../../lib/time/wib.ts';
import {
  type ScholarshipJobsRepository,
  scholarshipJobsRepository,
} from './scholarship-jobs.repository.ts';
import { type ScholarshipRepository, scholarshipRepository } from './scholarship.repository.ts';
import { scholarshipAcceptedEmail } from './scholarship.email.ts';
import { EXTENSION_WINDOW_DAYS, GRANT_MONTHS, quotaOf } from './scholarship.service.ts';

const REVIEW_DELAY_MS = 24 * 60 * 60 * 1000;
const BATCH_SIZE = 100;

type ReviewDeps = {
  repository?: ScholarshipRepository;
  jobsRepository?: ScholarshipJobsRepository;
  send?: (message: EmailMessage) => Promise<void>;
};

/** Accepts each application in turn, one transaction each; the ids that were accepted. */
async function acceptEach(
  jobs: ScholarshipJobsRepository,
  applications: readonly { id: string; userId: string }[],
  start: Date,
  end: Date,
): Promise<string[]> {
  const accepted: string[] = [];
  await applications.reduce(async (previous, application) => {
    await previous;
    try {
      if (await jobs.accept(application, start, end)) accepted.push(application.id);
    } catch (err) {
      logger.error({ err, applicationId: application.id }, 'Beasiswa Kira acceptance failed');
    }
  }, Promise.resolve());
  return accepted;
}

/** Emails every accepted application still without its result, this run's and earlier ones. */
async function sendResults(
  jobs: ScholarshipJobsRepository,
  send: (message: EmailMessage) => Promise<void>,
  now: Date,
): Promise<void> {
  const unsent = await jobs.findUnsentResults(BATCH_SIZE);
  const results = await Promise.allSettled(
    unsent.map((row) => {
      const grantEnd = wibDate(row.grantEnd);
      return send(
        scholarshipAcceptedEmail({
          to: row.email,
          name: row.displayName,
          grantStart: wibDate(row.grantStart),
          grantEnd,
          extensionFrom: addDays(grantEnd, -EXTENSION_WINDOW_DAYS),
        }),
      );
    }),
  );
  for (const result of results) {
    if (result.status === 'rejected') {
      logger.error({ err: result.reason }, 'Beasiswa Kira result email failed');
    }
  }
  await jobs.markResultEmailsSent(
    unsent.filter((_, index) => results[index]?.status === 'fulfilled').map((row) => row.id),
    now,
  );
}

export async function reviewScholarshipApplications(
  now: Date,
  deps: ReviewDeps = {},
): Promise<{ accepted: number; waitlisted: number; withdrawn: number }> {
  const repository = deps.repository ?? scholarshipRepository;
  const jobs = deps.jobsRepository ?? scholarshipJobsRepository;
  const send = deps.send ?? sendEmail;
  const { remaining } = await quotaOf(repository, now);
  const candidates = await jobs.findReviewable(
    new Date(now.getTime() - REVIEW_DELAY_MS),
    BATCH_SIZE,
  );
  const withdrawn = candidates.filter((row) => row.hasActivePlan);
  const open = candidates.filter((row) => !row.hasActivePlan);
  const chosen = open.slice(0, remaining);
  const waitlisted = open
    .slice(chosen.length)
    .filter((row) => row.status === APPLICATION_STATUS.inReview);

  await jobs.setStatus(
    withdrawn.map((row) => row.id),
    APPLICATION_STATUS.withdrawn,
  );
  const accepted = await acceptEach(jobs, chosen, now, addMonthsToInstant(now, GRANT_MONTHS));
  await jobs.setStatus(
    waitlisted.map((row) => row.id),
    APPLICATION_STATUS.waitlisted,
  );
  await sendResults(jobs, send, now);
  return { accepted: accepted.length, waitlisted: waitlisted.length, withdrawn: withdrawn.length };
}
