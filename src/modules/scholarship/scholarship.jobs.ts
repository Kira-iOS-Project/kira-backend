/**
 * The Beasiswa Kira review, simulated (AKN-10b to AKN-10d): every hour, applications open for more
 * than a day are accepted, oldest first, while this month's places last; the rest wait. An
 * accepted application gets three months of Kira Plus and the result by email.
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
  const accepted = open.slice(0, remaining);
  const waitlisted = open
    .slice(accepted.length)
    .filter((row) => row.status === APPLICATION_STATUS.inReview);

  const end = addMonthsToInstant(now, GRANT_MONTHS);
  await jobs.setStatus(
    withdrawn.map((row) => row.id),
    APPLICATION_STATUS.withdrawn,
  );
  await jobs.accept(accepted, now, end);
  await jobs.setStatus(
    waitlisted.map((row) => row.id),
    APPLICATION_STATUS.waitlisted,
  );

  const grantEnd = wibDate(end);
  const results = await Promise.allSettled(
    accepted.map((row) =>
      send(
        scholarshipAcceptedEmail({
          to: row.email,
          name: row.displayName,
          grantStart: wibDate(now),
          grantEnd,
          extensionFrom: addDays(grantEnd, -EXTENSION_WINDOW_DAYS),
        }),
      ),
    ),
  );
  for (const result of results) {
    if (result.status === 'rejected') {
      logger.error({ err: result.reason }, 'Beasiswa Kira result email failed');
    }
  }
  await jobs.markResultEmailsSent(
    accepted.filter((_, index) => results[index]?.status === 'fulfilled').map((row) => row.id),
    now,
  );
  return { accepted: accepted.length, waitlisted: waitlisted.length, withdrawn: withdrawn.length };
}
