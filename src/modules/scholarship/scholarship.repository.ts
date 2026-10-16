/**
 * The scholarship module's data access for its routes (AGENTS.md Rules 4 and 10): the person's
 * plan and application, and this month's quota from Traktir Kira gifts.
 */

import { and, desc, eq, gte, inArray, isNotNull, ne, sql } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { db } from '../../db/client/index.ts';
import { gifts, scholarshipApplications, subscriptions, users } from '../../db/schema/schema.ts';
import { SUBSCRIPTION_STATUS } from '../../lib/constants/plans.ts';
import { APPLICATION_STATUS, OPEN_APPLICATION_INDEX } from '../../lib/constants/scholarship.ts';
import type { SubscriptionSource } from '../../lib/usage/plan-usage.ts';
import type { ApplicationStatus, Situation } from './scholarship.schema.ts';

export type ApplicationRow = {
  id: string;
  status: ApplicationStatus;
  situations: Situation[];
  story: string | null;
  submittedAt: Date;
  decidedAt: Date | null;
  grantStart: Date | null;
  grantEnd: Date | null;
};

/** Applications still waiting for a decision. */
export const OPEN_STATUSES = [APPLICATION_STATUS.inReview, APPLICATION_STATUS.waitlisted];

export type ScholarshipRepository = {
  findActiveSubscriptionSource(userId: string): Promise<SubscriptionSource | null>;
  /** The latest application that was not withdrawn, with its grant's dates once accepted. */
  findCurrentApplication(userId: string): Promise<ApplicationRow | null>;
  /** Months gifted, and applications accepted, since the start of this month. */
  countQuota(since: Date): Promise<{ giftedMonths: number; accepted: number }>;
  hasUsedDebtEmergencyMode(userId: string): Promise<boolean>;
  /** Stores the application; null when the person already has an open one (a concurrent apply). */
  createApplication(input: {
    userId: string;
    situations: Situation[];
    story: string | null;
    usedDebtEmergencyMode: boolean;
    status: ApplicationStatus;
  }): Promise<ApplicationRow | null>;
  /** Withdraws the open application; false when there is none. */
  withdrawOpenApplication(userId: string): Promise<boolean>;
};

/** Postgres's unique_violation (SQLSTATE class 23). */
const UNIQUE_VIOLATION = '23505';

/** Whether `error`, or an error it wraps (Drizzle wraps the driver's), broke `constraint`. */
function violates(error: unknown, constraint: string): boolean {
  if (typeof error !== 'object' || error === null) return false;
  if (
    Reflect.get(error, 'code') === UNIQUE_VIOLATION &&
    Reflect.get(error, 'constraint_name') === constraint
  ) {
    return true;
  }
  return violates(Reflect.get(error, 'cause'), constraint);
}

const applicationColumns = {
  id: scholarshipApplications.id,
  status: scholarshipApplications.status,
  situations: scholarshipApplications.situations,
  story: scholarshipApplications.story,
  submittedAt: scholarshipApplications.submittedAt,
  decidedAt: scholarshipApplications.decidedAt,
};

export function createScholarshipRepository(
  client: PostgresJsDatabase = db,
): ScholarshipRepository {
  return {
    async findActiveSubscriptionSource(userId) {
      const [row] = await client
        .select({ source: subscriptions.source })
        .from(subscriptions)
        .where(
          and(
            eq(subscriptions.userId, userId),
            eq(subscriptions.status, SUBSCRIPTION_STATUS.active),
          ),
        )
        .limit(1);
      return row?.source ?? null;
    },

    async findCurrentApplication(userId) {
      const [row] = await client
        .select({
          ...applicationColumns,
          grantStart: subscriptions.currentPeriodStart,
          grantEnd: subscriptions.currentPeriodEnd,
        })
        .from(scholarshipApplications)
        .leftJoin(subscriptions, eq(subscriptions.id, scholarshipApplications.subscriptionId))
        .where(
          and(
            eq(scholarshipApplications.userId, userId),
            ne(scholarshipApplications.status, APPLICATION_STATUS.withdrawn),
          ),
        )
        .orderBy(desc(scholarshipApplications.submittedAt))
        .limit(1);
      return row ?? null;
    },

    async countQuota(since) {
      const [[gifted], [accepted]] = await Promise.all([
        client
          .select({ months: sql<number>`coalesce(sum(${gifts.months}), 0)::int` })
          .from(gifts)
          .where(gte(gifts.createdAt, since)),
        client
          .select({ count: sql<number>`count(*)::int` })
          .from(scholarshipApplications)
          .where(
            and(
              eq(scholarshipApplications.status, APPLICATION_STATUS.accepted),
              gte(scholarshipApplications.decidedAt, since),
            ),
          ),
      ]);
      return { giftedMonths: gifted?.months ?? 0, accepted: accepted?.count ?? 0 };
    },

    async hasUsedDebtEmergencyMode(userId) {
      const [row] = await client
        .select({ id: users.id })
        .from(users)
        .where(and(eq(users.id, userId), isNotNull(users.debtEmergencyModeUsedAt)))
        .limit(1);
      return row !== undefined;
    },

    async createApplication(input) {
      try {
        const [row] = await client
          .insert(scholarshipApplications)
          .values(input)
          .returning(applicationColumns);
        if (!row) throw new Error('The application was not stored');
        return { ...row, grantStart: null, grantEnd: null };
      } catch (err) {
        if (violates(err, OPEN_APPLICATION_INDEX)) return null;
        throw err;
      }
    },

    async withdrawOpenApplication(userId) {
      const rows = await client
        .update(scholarshipApplications)
        .set({ status: APPLICATION_STATUS.withdrawn })
        .where(
          and(
            eq(scholarshipApplications.userId, userId),
            inArray(scholarshipApplications.status, OPEN_STATUSES),
          ),
        )
        .returning({ id: scholarshipApplications.id });
      return rows.length > 0;
    },
  };
}

export const scholarshipRepository = createScholarshipRepository();
