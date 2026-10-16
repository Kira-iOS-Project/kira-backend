/**
 * The scholarship review job's data access: the applications old enough to decide, and the
 * decisions themselves (a Kira Plus grant per accepted application, written together).
 */

import { and, asc, eq, inArray, lte, sql } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { db } from '../../db/client/index.ts';
import { scholarshipApplications, subscriptions, users } from '../../db/schema/schema.ts';
import {
  BILLING_PERIOD,
  PLAN,
  SUBSCRIPTION_SOURCE,
  SUBSCRIPTION_STATUS,
} from '../../lib/constants/plans.ts';
import { APPLICATION_STATUS } from '../../lib/constants/scholarship.ts';
import { OPEN_STATUSES } from './scholarship.repository.ts';
import type { ApplicationStatus } from './scholarship.schema.ts';

export type ReviewableApplication = {
  id: string;
  userId: string;
  status: ApplicationStatus;
  email: string;
  displayName: string;
  /** Bought or granted a plan since applying: the application no longer applies. */
  hasActivePlan: boolean;
};

export type ScholarshipJobsRepository = {
  /** Open applications submitted at or before `before`, oldest first. */
  findReviewable(before: Date, limit: number): Promise<ReviewableApplication[]>;
  /** Grants Kira Plus from `start` to `end` to each application's person and accepts it. */
  accept(applications: { id: string; userId: string }[], start: Date, end: Date): Promise<void>;
  setStatus(ids: string[], status: ApplicationStatus): Promise<void>;
  markResultEmailsSent(ids: string[], now: Date): Promise<void>;
};

export function createScholarshipJobsRepository(
  client: PostgresJsDatabase = db,
): ScholarshipJobsRepository {
  return {
    findReviewable(before, limit) {
      return client
        .select({
          id: scholarshipApplications.id,
          userId: scholarshipApplications.userId,
          status: scholarshipApplications.status,
          email: users.email,
          displayName: users.displayName,
          hasActivePlan: sql<boolean>`exists (select 1 from ${subscriptions} where ${subscriptions.userId} = ${scholarshipApplications.userId} and ${subscriptions.status} = ${SUBSCRIPTION_STATUS.active})`,
        })
        .from(scholarshipApplications)
        .innerJoin(users, eq(users.id, scholarshipApplications.userId))
        .where(
          and(
            inArray(scholarshipApplications.status, OPEN_STATUSES),
            lte(scholarshipApplications.submittedAt, before),
          ),
        )
        .orderBy(asc(scholarshipApplications.submittedAt))
        .limit(limit);
    },

    async accept(applications, start, end) {
      if (applications.length === 0) return;
      await client.transaction(async (tx) => {
        await tx.insert(subscriptions).values(
          applications.map(({ userId }) => ({
            userId,
            plan: PLAN.plus,
            period: BILLING_PERIOD.monthly,
            source: SUBSCRIPTION_SOURCE.scholarship,
            status: SUBSCRIPTION_STATUS.active,
            currentPeriodStart: start,
            currentPeriodEnd: end,
          })),
        );
        await tx
          .update(scholarshipApplications)
          .set({
            status: APPLICATION_STATUS.accepted,
            decidedAt: start,
            subscriptionId: sql`(select ${subscriptions.id} from ${subscriptions} where ${subscriptions.userId} = ${scholarshipApplications.userId} and ${subscriptions.status} = ${SUBSCRIPTION_STATUS.active} limit 1)`,
          })
          .where(
            inArray(
              scholarshipApplications.id,
              applications.map(({ id }) => id),
            ),
          );
      });
    },

    async setStatus(ids, status) {
      if (ids.length === 0) return;
      await client
        .update(scholarshipApplications)
        .set({ status })
        .where(inArray(scholarshipApplications.id, ids));
    },

    async markResultEmailsSent(ids, now) {
      if (ids.length === 0) return;
      await client
        .update(scholarshipApplications)
        .set({ resultEmailSentAt: now })
        .where(inArray(scholarshipApplications.id, ids));
    },
  };
}

export const scholarshipJobsRepository = createScholarshipJobsRepository();
