/**
 * Beasiswa Kira (AKN-09 to AKN-10d): eligibility, this month's quota from Traktir Kira, applying
 * and withdrawing. Review is a simulation in this release (scholarship.jobs.ts decides).
 */

import { SUBSCRIPTION_SOURCE } from '../../lib/constants/plans.ts';
import { APPLICATION_STATUS, INELIGIBLE_REASON } from '../../lib/constants/scholarship.ts';
import { addDays, monthStart, wibDate, wibStartOfDay } from '../../lib/time/wib.ts';
import {
  ScholarshipApplicationNotFoundError,
  ScholarshipNotEligibleError,
} from './scholarship.errors.ts';
import {
  type ApplicationRow,
  type ScholarshipRepository,
  scholarshipRepository,
} from './scholarship.repository.ts';
import type {
  ApplicationResponse,
  ApplyBody,
  IneligibleReason,
  ScholarshipResponse,
} from './scholarship.schema.ts';

/** Gifted months that make one place: a grant is three months of Kira Plus. */
export const GRANT_MONTHS = 3;
const REVIEW_WORKING_DAYS = 3;
export const EXTENSION_WINDOW_DAYS = 14;
const SATURDAY = 6;
const SUNDAY = 0;

type ScholarshipDeps = { repository?: ScholarshipRepository; now?: () => Date };

function resolve(deps: ScholarshipDeps) {
  return { repository: deps.repository ?? scholarshipRepository, now: deps.now?.() ?? new Date() };
}

/** The date `days` working days (Monday to Friday) after `date`. */
export function addWorkingDays(date: string, days: number): string {
  let current = date;
  let left = days;
  while (left > 0) {
    current = addDays(current, 1);
    const weekday = new Date(`${current}T00:00:00Z`).getUTCDay();
    if (weekday !== SATURDAY && weekday !== SUNDAY) left -= 1;
  }
  return current;
}

export function toApplication(row: ApplicationRow): ApplicationResponse {
  const grantEnd = row.grantEnd ? wibDate(row.grantEnd) : null;
  return {
    id: row.id,
    status: row.status,
    situations: row.situations,
    story: row.story,
    submittedAt: row.submittedAt.toISOString(),
    decideBy: addWorkingDays(wibDate(row.submittedAt), REVIEW_WORKING_DAYS),
    decidedAt: row.decidedAt?.toISOString() ?? null,
    grantStart: row.grantStart ? wibDate(row.grantStart) : null,
    grantEnd,
    extensionFrom: grantEnd ? addDays(grantEnd, -EXTENSION_WINDOW_DAYS) : null,
  };
}

/** This WIB month's places: one per three gifted months, less those already accepted. */
export async function quotaOf(repository: ScholarshipRepository, now: Date) {
  const since = wibStartOfDay(monthStart(wibDate(now)));
  const { giftedMonths, accepted } = await repository.countQuota(since);
  const total = Math.floor(giftedMonths / GRANT_MONTHS);
  return { remaining: Math.max(0, total - accepted), total };
}

function ineligibleReason(
  source: string | null,
  application: ApplicationRow | null,
): IneligibleReason | null {
  if (source === SUBSCRIPTION_SOURCE.purchase) return INELIGIBLE_REASON.hasPaidPlan;
  if (source === SUBSCRIPTION_SOURCE.scholarship) return INELIGIBLE_REASON.hasScholarship;
  const open =
    application?.status === APPLICATION_STATUS.inReview ||
    application?.status === APPLICATION_STATUS.waitlisted;
  return open ? INELIGIBLE_REASON.hasOpenApplication : null;
}

async function stateOf(repository: ScholarshipRepository, userId: string, now: Date) {
  const [source, application, quota] = await Promise.all([
    repository.findActiveSubscriptionSource(userId),
    repository.findCurrentApplication(userId),
    quotaOf(repository, now),
  ]);
  /** An accepted application whose grant has ended is history: the person may apply again. */
  const ended =
    application?.status === APPLICATION_STATUS.accepted &&
    source !== SUBSCRIPTION_SOURCE.scholarship;
  return {
    reason: ineligibleReason(source, application),
    application: ended ? null : application,
    quota,
  };
}

/** Beasiswa Kira: whether the person can apply, the quota, and their application. */
export async function getScholarship(
  userId: string,
  deps: ScholarshipDeps = {},
): Promise<ScholarshipResponse> {
  const { repository, now } = resolve(deps);
  const { reason, application, quota } = await stateOf(repository, userId, now);
  return {
    eligible: reason === null,
    ineligibleReason: reason,
    quota,
    application: application ? toApplication(application) : null,
  };
}

/**
 * Kirim Pengajuan: in review, or on the waiting list when this month's places are taken. Only the
 * account and a yes or no on Mode Darurat Utang go with it, never transactions or balances.
 */
export async function apply(
  userId: string,
  body: ApplyBody,
  deps: ScholarshipDeps = {},
): Promise<ApplicationResponse> {
  const { repository, now } = resolve(deps);
  const { reason, quota } = await stateOf(repository, userId, now);
  if (reason !== null) throw new ScholarshipNotEligibleError(reason);
  const story = body.story?.trim() ?? '';
  const row = await repository.createApplication({
    userId,
    situations: [...new Set(body.situations)],
    story: story === '' ? null : story,
    usedDebtEmergencyMode: await repository.hasUsedDebtEmergencyMode(userId),
    status: quota.remaining > 0 ? APPLICATION_STATUS.inReview : APPLICATION_STATUS.waitlisted,
  });
  /** A second apply that raced the first past the check above lost at the unique index. */
  if (row === null) throw new ScholarshipNotEligibleError(INELIGIBLE_REASON.hasOpenApplication);
  return toApplication(row);
}

/** Tarik Pengajuan. */
export async function withdraw(userId: string, deps: ScholarshipDeps = {}): Promise<void> {
  const { repository } = resolve(deps);
  if (!(await repository.withdrawOpenApplication(userId))) {
    throw new ScholarshipApplicationNotFoundError();
  }
}
