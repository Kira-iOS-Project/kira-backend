/**
 * Riwayat Kira Score's data access (AGENTS.md Rules 4 and 10): the snapshots it plots, the people
 * the monthly job still owes a point, that point's insert, and every snapshot for Unduh Datamu.
 */

import { and, asc, eq, gt, gte, isNotNull, notExists } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { db } from '../../db/client/index.ts';
import {
  financialProfiles,
  MONTHLY_SNAPSHOT_PREDICATE,
  scoreSnapshots,
  type IndicatorLabels,
  type IndicatorPoints,
} from '../../db/schema/schema.ts';
import { SNAPSHOT_REASON } from '../../lib/constants/score.ts';
import type { ScoreBand } from './score.engine.ts';
import type { NewSnapshot } from './score.repository.ts';

type Values<T> = T[keyof T];

/** A snapshot Riwayat Kira Score plots: a monthly one or the first health check's. */
export type HistorySnapshot = {
  reason: Values<typeof SNAPSHOT_REASON>;
  periodStart: string;
  createdAt: Date;
  score: number;
  indicators: IndicatorPoints;
  measures: IndicatorLabels | null;
};

/** A snapshot as Unduh Datamu lists it. */
export type ExportSnapshot = {
  reason: Values<typeof SNAPSHOT_REASON>;
  createdAt: Date;
  score: number;
  band: ScoreBand;
};

export type ScoreHistoryRepository = {
  /**
   * The monthly snapshots created since `since`, and the first health check's whenever it was,
   * oldest first.
   */
  listHistory(userId: string, since: Date): Promise<HistorySnapshot[]>;
  /**
   * Up to `limit` people with an answered health check and no monthly snapshot for the month whose
   * 25th is `periodStart`, by id after `afterId`.
   */
  listMonthlyCandidates(
    periodStart: string,
    limit: number,
    afterId: string | null,
  ): Promise<string[]>;
  /** A second monthly snapshot for the same month is dropped by the partial unique index. */
  insertMonthlySnapshot(userId: string, snapshot: NewSnapshot): Promise<boolean>;
  /** Every snapshot of a person, oldest first, for Unduh Datamu. */
  listSnapshots(userId: string): Promise<ExportSnapshot[]>;
};

export function createScoreHistoryRepository(
  client: PostgresJsDatabase = db,
): ScoreHistoryRepository {
  return {
    async listHistory(userId, since) {
      const columns = {
        reason: scoreSnapshots.reason,
        periodStart: scoreSnapshots.periodStart,
        createdAt: scoreSnapshots.createdAt,
        score: scoreSnapshots.score,
        indicators: scoreSnapshots.indicators,
        measures: scoreSnapshots.measures,
      };
      const [monthly, first] = await Promise.all([
        client
          .select(columns)
          .from(scoreSnapshots)
          .where(
            and(
              eq(scoreSnapshots.userId, userId),
              eq(scoreSnapshots.reason, SNAPSHOT_REASON.monthly),
              gte(scoreSnapshots.createdAt, since),
            ),
          )
          .orderBy(asc(scoreSnapshots.createdAt)),
        client
          .select(columns)
          .from(scoreSnapshots)
          .where(
            and(
              eq(scoreSnapshots.userId, userId),
              eq(scoreSnapshots.reason, SNAPSHOT_REASON.healthCheck),
            ),
          )
          .orderBy(asc(scoreSnapshots.createdAt))
          .limit(1),
      ]);
      return [...first, ...monthly].toSorted(
        (a, b) => a.createdAt.getTime() - b.createdAt.getTime(),
      );
    },

    async listMonthlyCandidates(periodStart, limit, afterId) {
      const rows = await client
        .select({ id: financialProfiles.userId })
        .from(financialProfiles)
        .where(
          and(
            isNotNull(financialProfiles.completedAt),
            afterId === null ? undefined : gt(financialProfiles.userId, afterId),
            notExists(
              client
                .select({ id: scoreSnapshots.id })
                .from(scoreSnapshots)
                .where(
                  and(
                    eq(scoreSnapshots.userId, financialProfiles.userId),
                    eq(scoreSnapshots.periodStart, periodStart),
                    eq(scoreSnapshots.reason, SNAPSHOT_REASON.monthly),
                  ),
                ),
            ),
          ),
        )
        .orderBy(asc(financialProfiles.userId))
        .limit(limit);
      return rows.map((row) => row.id);
    },

    async insertMonthlySnapshot(userId, snapshot) {
      const rows = await client
        .insert(scoreSnapshots)
        .values({ userId, ...snapshot })
        .onConflictDoNothing({
          target: [scoreSnapshots.userId, scoreSnapshots.periodStart],
          where: MONTHLY_SNAPSHOT_PREDICATE,
        })
        .returning({ id: scoreSnapshots.id });
      return rows.length > 0;
    },

    listSnapshots(userId) {
      return client
        .select({
          reason: scoreSnapshots.reason,
          createdAt: scoreSnapshots.createdAt,
          score: scoreSnapshots.score,
          band: scoreSnapshots.band,
        })
        .from(scoreSnapshots)
        .where(eq(scoreSnapshots.userId, userId))
        .orderBy(asc(scoreSnapshots.createdAt));
    },
  };
}

export const scoreHistoryRepository = createScoreHistoryRepository();
