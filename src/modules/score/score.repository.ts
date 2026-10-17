/**
 * The score module's data access (AGENTS.md Rules 4 and 10): the health-check answers, the open
 * debt accounts and the score snapshots. Saving a health check is one transaction.
 */

import { and, count, desc, eq, gte, isNull, lt, sql } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { db } from '../../db/client/index.ts';
import {
  assets,
  debtAccounts,
  financialProfiles,
  scoreSnapshots,
  type IndicatorLabels,
  type IndicatorPoints,
  users,
} from '../../db/schema/schema.ts';
import { FOCUS } from '../../lib/constants/profile.ts';
import { SNAPSHOT_REASON } from '../../lib/constants/score.ts';
import type { Payday } from '../../lib/time/wib.ts';
import type { DebtInput, ScoreBand, ScoreInput } from './score.engine.ts';
import type { HealthCheckBody } from './score.schema.ts';

type Values<T> = T[keyof T];

/** A person's answers and the account settings the score reads; `input` is null before the quiz. */
type ScoreState = {
  focus: Values<typeof FOCUS>;
  payday: Payday;
  input: Omit<ScoreInput, 'debts'> | null;
};

type SnapshotHistory = {
  count: number;
  /** The latest snapshot inside the current payday period, if any. */
  latestInPeriodAt: Date | null;
  /** The latest score from before the current payday period, if any. */
  previousScore: number | null;
};

export type NewSnapshot = {
  score: number;
  band: ScoreBand;
  indicators: IndicatorPoints;
  measures: IndicatorLabels;
  reason: Values<typeof SNAPSHOT_REASON>;
  /** The payday period's first day (`YYYY-MM-DD`). */
  periodStart: string;
};

/** At most this many open debt accounts are read: the quiz accepts twenty. */
const DEBT_LIMIT = 50;

export type ScoreRepository = {
  findState(userId: string): Promise<ScoreState | null>;
  listOpenDebts(userId: string): Promise<DebtInput[]>;
  snapshotHistory(userId: string, periodStart: Date): Promise<SnapshotHistory>;
  insertSnapshot(userId: string, snapshot: NewSnapshot): Promise<void>;
  /** Stores the answers, replaces the debt accounts, sets the payday and records the snapshot. */
  saveHealthCheck(
    userId: string,
    body: HealthCheckBody,
    snapshot: NewSnapshot,
    now: Date,
  ): Promise<void>;
};

export function createScoreRepository(client: PostgresJsDatabase = db): ScoreRepository {
  return {
    async findState(userId) {
      const [row] = await client
        .select({
          focus: users.focus,
          paydayDay: users.paydayDay,
          paydayEndOfMonth: users.paydayEndOfMonth,
          completedAt: financialProfiles.completedAt,
          income: financialProfiles.netMonthlyIncome,
          essential: financialProfiles.essentialMonthlyExpenses,
          emergencyFund: financialProfiles.emergencyFund,
          monthlySavings: financialProfiles.monthlySavings,
          /** Portofolio Manual's total replaces the health check's figure once there are assets. */
          otherAssets: sql<
            number | null
          >`coalesce((select sum(${assets.value}) from ${assets} where ${assets.userId} = ${users.id}), ${financialProfiles.otherAssets})`.mapWith(
            Number,
          ),
          propertyAssets: financialProfiles.propertyAssets,
          dependents: financialProfiles.dependents,
          maritalStatus: financialProfiles.maritalStatus,
          protections: financialProfiles.protections,
        })
        .from(users)
        .leftJoin(financialProfiles, eq(financialProfiles.userId, users.id))
        .where(eq(users.id, userId))
        .limit(1);
      if (!row) return null;
      const { focus, paydayDay, paydayEndOfMonth, completedAt, ...answers } = row;
      return {
        focus,
        payday: { day: paydayDay, endOfMonth: paydayEndOfMonth },
        input:
          completedAt === null
            ? null
            : {
                ...answers,
                dependents: answers.dependents ?? 0,
                protections: answers.protections ?? [],
              },
      };
    },

    listOpenDebts(userId) {
      return client
        .select({
          id: debtAccounts.id,
          kind: debtAccounts.kind,
          name: debtAccounts.name,
          remaining: debtAccounts.remainingAmount,
          monthlyInstalment: debtAccounts.monthlyInstalment,
          paymentStatus: debtAccounts.paymentStatus,
        })
        .from(debtAccounts)
        .where(and(eq(debtAccounts.userId, userId), isNull(debtAccounts.paidOffAt)))
        .orderBy(debtAccounts.createdAt)
        .limit(DEBT_LIMIT);
    },

    async snapshotHistory(userId, periodStart) {
      const [[summary], [previous]] = await Promise.all([
        client
          .select({
            count: count(),
            latestInPeriodAt:
              sql<Date | null>`max(${scoreSnapshots.createdAt}) filter (where ${gte(scoreSnapshots.createdAt, periodStart)})`.mapWith(
                scoreSnapshots.createdAt,
              ),
          })
          .from(scoreSnapshots)
          .where(eq(scoreSnapshots.userId, userId)),
        client
          .select({ score: scoreSnapshots.score })
          .from(scoreSnapshots)
          .where(and(eq(scoreSnapshots.userId, userId), lt(scoreSnapshots.createdAt, periodStart)))
          .orderBy(desc(scoreSnapshots.createdAt))
          .limit(1),
      ]);
      return {
        count: summary?.count ?? 0,
        latestInPeriodAt: summary?.latestInPeriodAt ?? null,
        previousScore: previous?.score ?? null,
      };
    },

    /** A second recompute for the same period is dropped by the partial unique index. */
    async insertSnapshot(userId, snapshot) {
      await client
        .insert(scoreSnapshots)
        .values({ userId, ...snapshot })
        .onConflictDoNothing({
          target: [scoreSnapshots.userId, scoreSnapshots.periodStart],
          where: sql`${scoreSnapshots.reason} = ${sql.raw(`'${SNAPSHOT_REASON.recompute}'`)}`,
        });
    },

    async saveHealthCheck(userId, body, snapshot, now) {
      const { payday, debts, ...answers } = body;
      const profile = { ...answers, completedAt: now };
      await client.transaction(async (tx) => {
        await tx
          .insert(financialProfiles)
          .values({ userId, ...profile })
          .onConflictDoUpdate({ target: financialProfiles.userId, set: profile });
        await tx.delete(debtAccounts).where(eq(debtAccounts.userId, userId));
        if (debts.length > 0) {
          await tx.insert(debtAccounts).values(
            debts.map((debt) => ({
              kind: debt.kind,
              name: debt.name,
              monthlyInstalment: debt.monthlyInstalment,
              remainingTenorMonths: debt.remainingTenorMonths,
              annualInterestRate: debt.annualInterestRate,
              dueDay: debt.dueDay,
              userId,
              originalAmount: debt.remaining,
              remainingAmount: debt.remaining,
            })),
          );
        }
        await tx
          .update(users)
          .set({ paydayDay: payday.day, paydayEndOfMonth: payday.endOfMonth })
          .where(eq(users.id, userId));
        await tx.insert(scoreSnapshots).values({ userId, ...snapshot });
      });
    },
  };
}

export const scoreRepository = createScoreRepository();
