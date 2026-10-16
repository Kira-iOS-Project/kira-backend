/**
 * Mock builders for the scholarship module's injected dependencies (AGENTS.md Rule 19).
 */

import { APPLICATION_STATUS, SCHOLARSHIP_SITUATION } from '../../../lib/constants/scholarship.ts';
import type { ScholarshipJobsRepository } from '../scholarship-jobs.repository.ts';
import type { ApplicationRow, ScholarshipRepository } from '../scholarship.repository.ts';

/** Friday 16 October 2026, 12.10 WIB. */
export const NOW = new Date('2026-10-16T05:10:00.000Z');
export const USER_ID = 'user-1';

export function applicationRow(overrides: Partial<ApplicationRow> = {}): ApplicationRow {
  return {
    id: 'app-1',
    status: APPLICATION_STATUS.inReview,
    situations: [SCHOLARSHIP_SITUATION.instalmentsPilingUp],
    story: null,
    submittedAt: NOW,
    decidedAt: null,
    grantStart: null,
    grantEnd: null,
    ...overrides,
  };
}

export function createScholarshipRepositoryMock(
  overrides: Partial<ScholarshipRepository> = {},
): ScholarshipRepository {
  return {
    findActiveSubscriptionSource: async () => null,
    findCurrentApplication: async () => null,
    countQuota: async () => ({ giftedMonths: 0, accepted: 0 }),
    hasUsedDebtEmergencyMode: async () => false,
    createApplication: async () => applicationRow(),
    withdrawOpenApplication: async () => false,
    ...overrides,
  };
}

export function createScholarshipJobsRepositoryMock(
  overrides: Partial<ScholarshipJobsRepository> = {},
): ScholarshipJobsRepository {
  return {
    findReviewable: async () => [],
    accept: async () => true,
    setStatus: async () => undefined,
    findUnsentResults: async () => [],
    markResultEmailsSent: async () => undefined,
    ...overrides,
  };
}
