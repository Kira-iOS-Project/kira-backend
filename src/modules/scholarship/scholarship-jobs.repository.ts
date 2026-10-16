/**
 * The scholarship review job's data access: the applications old enough to decide, the decisions
 * themselves (each acceptance and its Kira Plus grant in a transaction of its own), and the
 * accepted applications whose result email has not gone out yet.
 */

import { and, asc, eq, inArray, isNull, lte, notExists, sql } from 'drizzle-orm';
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

export type UnsentResult = {
  id: string;
  email: string;
  displayName: string;
  grantStart: Date;
  grantEnd: Date;
};

export type ScholarshipJobsRepository = {
  /** Open applications submitted at or before `before`, oldest first. */
  findReviewable(before: Date, limit: number): Promise<ReviewableApplication[]>;
  /**
   * Accepts the application and grants its person Kira Plus from `start` to `end`. False, with
   * nothing written, when it is no longer open (withdrawn meanwhile) or the person holds a plan.
   */
  accept(application: { id: string; userId: string }, start: Date, end: Date): Promise<boolean>;
  /** Moves the applications that are still open to `status`; a decided one keeps its own. */
  setStatus(ids: string[], status: ApplicationStatus): Promise<void>;
  /** Accepted applications whose result email has not gone out, oldest decision first. */
  findUnsentResults(limit: number): Promise<UnsentResult[]>;
  markResultEmailsSent(ids: string[], now: Date): Promise<void>;
};

const stillOpen = inArray(scholarshipApplications.status, OPEN_STATUSES);

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
        .where(and(stillOpen, lte(scholarshipApplications.submittedAt, before)))
        .orderBy(asc(scholarshipApplications.submittedAt))
        .limit(limit);
    },

    accept({ id, userId }, start, end) {
      return client.transaction(async (tx) => {
        /** The same per-person lock as checkout: a purchase and a grant never cross. */
        await tx
          .select({ id: users.id })
          .from(users)
          .where(eq(users.id, userId))
          .for('no key update');
        const [decided] = await tx
          .update(scholarshipApplications)
          .set({ status: APPLICATION_STATUS.accepted, decidedAt: start })
          .where(
            and(
              eq(scholarshipApplications.id, id),
              stillOpen,
              notExists(
                tx
                  .select({ id: subscriptions.id })
                  .from(subscriptions)
                  .where(
                    and(
                      eq(subscriptions.userId, userId),
                      eq(subscriptions.status, SUBSCRIPTION_STATUS.active),
                    ),
                  ),
              ),
            ),
          )
          .returning({ id: scholarshipApplications.id });
        if (!decided) return false;
        const [grant] = await tx
          .insert(subscriptions)
          .values({
            userId,
            plan: PLAN.plus,
            period: BILLING_PERIOD.monthly,
            source: SUBSCRIPTION_SOURCE.scholarship,
            status: SUBSCRIPTION_STATUS.active,
            currentPeriodStart: start,
            currentPeriodEnd: end,
          })
          .returning({ id: subscriptions.id });
        if (!grant) throw new Error('The grant was not created');
        await tx
          .update(scholarshipApplications)
          .set({ subscriptionId: grant.id })
          .where(eq(scholarshipApplications.id, id));
        return true;
      });
    },

    async setStatus(ids, status) {
      if (ids.length === 0) return;
      await client
        .update(scholarshipApplications)
        .set({ status })
        .where(and(inArray(scholarshipApplications.id, ids), stillOpen));
    },

    findUnsentResults(limit) {
      return client
        .select({
          id: scholarshipApplications.id,
          email: users.email,
          displayName: users.displayName,
          grantStart: subscriptions.currentPeriodStart,
          grantEnd: subscriptions.currentPeriodEnd,
        })
        .from(scholarshipApplications)
        .innerJoin(users, eq(users.id, scholarshipApplications.userId))
        .innerJoin(subscriptions, eq(subscriptions.id, scholarshipApplications.subscriptionId))
        .where(
          and(
            eq(scholarshipApplications.status, APPLICATION_STATUS.accepted),
            isNull(scholarshipApplications.resultEmailSentAt),
          ),
        )
        .orderBy(asc(scholarshipApplications.decidedAt))
        .limit(limit);
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
