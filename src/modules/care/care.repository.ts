/**
 * Kira Peduli's data access (AGENTS.md Rules 4 and 10): crisis signals, check-ins, Mode Darurat
 * Utang's first opening, the health check's debts and the sealed safety plan.
 */

import { and, asc, desc, eq, inArray, isNull, lte, sql } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { db } from '../../db/client/index.ts';
import {
  careCheckIns,
  careSafetyPlans,
  careSignals,
  debtAccounts,
  users,
} from '../../db/schema/schema.ts';
import { CHECK_IN_STATUS } from '../../lib/constants/care.ts';
import { EXPORT_ROW_LIMIT } from '../../lib/constants/export.ts';
import type { CareSignalBody, Debt } from './care.schema.ts';

type CheckInRow = { id: string; dueAt: Date };
type CheckInHistoryRow = CheckInRow & {
  status: (typeof CHECK_IN_STATUS)[keyof typeof CHECK_IN_STATUS];
  seenAt: Date | null;
  createdAt: Date;
};
export type SealedPlanRow = { sealed: string; updatedAt: Date };

/** The most debts one list carries: far more than a health check lets a person add. */
const DEBT_LIST_LIMIT = 50;

export type CareRepository = {
  recordSignal(userId: string, signal: CareSignalBody): Promise<void>;
  /** Cancels any pending check-in and schedules the new one, in one transaction. */
  scheduleCheckIn(userId: string, dueAt: Date): Promise<CheckInRow>;
  /** Cancels a pending check-in; false when there is none with that id. */
  cancelCheckIn(userId: string, id: string): Promise<boolean>;
  /** The pending check-in whose time has come, the latest first. */
  findDueCheckIn(userId: string, now: Date): Promise<CheckInRow | null>;
  /** Marks a pending or seen check-in seen, keeping the first time; false when there is none. */
  markCheckInSeen(userId: string, id: string, now: Date): Promise<boolean>;
  listCheckIns(userId: string): Promise<CheckInHistoryRow[]>;
  /** Turns Mode Darurat Utang on once and answers the first time it was turned on. */
  activateDebtEmergency(userId: string, now: Date): Promise<Date | null>;
  findDebtEmergency(userId: string): Promise<Date | null>;
  listDebts(userId: string): Promise<Debt[]>;
  findSafetyPlan(userId: string): Promise<SealedPlanRow | null>;
  saveSafetyPlan(userId: string, sealed: string): Promise<SealedPlanRow>;
};

const checkInColumns = { id: careCheckIns.id, dueAt: careCheckIns.dueAt };
const mine = (userId: string, id: string) =>
  and(eq(careCheckIns.userId, userId), eq(careCheckIns.id, id));

export function createCareRepository(client: PostgresJsDatabase = db): CareRepository {
  return {
    async recordSignal(userId, signal) {
      await client
        .insert(careSignals)
        .values({ userId, level: signal.level, source: signal.source });
    },

    async scheduleCheckIn(userId, dueAt) {
      return client.transaction(async (tx) => {
        await tx
          .update(careCheckIns)
          .set({ status: CHECK_IN_STATUS.cancelled })
          .where(
            and(
              eq(careCheckIns.userId, userId),
              eq(careCheckIns.status, CHECK_IN_STATUS.scheduled),
            ),
          );
        const [row] = await tx
          .insert(careCheckIns)
          .values({ userId, dueAt })
          .returning(checkInColumns);
        if (row === undefined) throw new Error('The check-in was not stored');
        return row;
      });
    },

    async cancelCheckIn(userId, id) {
      const rows = await client
        .update(careCheckIns)
        .set({ status: CHECK_IN_STATUS.cancelled })
        .where(and(mine(userId, id), eq(careCheckIns.status, CHECK_IN_STATUS.scheduled)))
        .returning({ id: careCheckIns.id });
      return rows.length > 0;
    },

    async findDueCheckIn(userId, now) {
      const [row] = await client
        .select(checkInColumns)
        .from(careCheckIns)
        .where(
          and(
            eq(careCheckIns.userId, userId),
            eq(careCheckIns.status, CHECK_IN_STATUS.scheduled),
            lte(careCheckIns.dueAt, now),
          ),
        )
        .orderBy(desc(careCheckIns.dueAt))
        .limit(1);
      return row ?? null;
    },

    async markCheckInSeen(userId, id, now) {
      const rows = await client
        .update(careCheckIns)
        .set({
          status: CHECK_IN_STATUS.seen,
          seenAt: sql`coalesce(${careCheckIns.seenAt}, ${now.toISOString()}::timestamptz)`,
        })
        .where(
          and(
            mine(userId, id),
            inArray(careCheckIns.status, [CHECK_IN_STATUS.scheduled, CHECK_IN_STATUS.seen]),
          ),
        )
        .returning({ id: careCheckIns.id });
      return rows.length > 0;
    },

    async listCheckIns(userId) {
      return client
        .select({
          ...checkInColumns,
          status: careCheckIns.status,
          seenAt: careCheckIns.seenAt,
          createdAt: careCheckIns.createdAt,
        })
        .from(careCheckIns)
        .where(eq(careCheckIns.userId, userId))
        .orderBy(asc(careCheckIns.createdAt))
        .limit(EXPORT_ROW_LIMIT);
    },

    async activateDebtEmergency(userId, now) {
      const [row] = await client
        .update(users)
        .set({
          debtEmergencyModeUsedAt: sql`coalesce(${users.debtEmergencyModeUsedAt}, ${now.toISOString()}::timestamptz)`,
        })
        .where(eq(users.id, userId))
        .returning({ activatedAt: users.debtEmergencyModeUsedAt });
      return row?.activatedAt ?? null;
    },

    async findDebtEmergency(userId) {
      const [row] = await client
        .select({ activatedAt: users.debtEmergencyModeUsedAt })
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);
      return row?.activatedAt ?? null;
    },

    async listDebts(userId) {
      return client
        .select({
          id: debtAccounts.id,
          name: debtAccounts.name,
          kind: debtAccounts.kind,
          remaining: debtAccounts.remainingAmount,
          monthlyInstalment: debtAccounts.monthlyInstalment,
        })
        .from(debtAccounts)
        .where(and(eq(debtAccounts.userId, userId), isNull(debtAccounts.paidOffAt)))
        .orderBy(asc(debtAccounts.createdAt), asc(debtAccounts.id))
        .limit(DEBT_LIST_LIMIT);
    },

    async findSafetyPlan(userId) {
      const [row] = await client
        .select({ sealed: careSafetyPlans.sealed, updatedAt: careSafetyPlans.updatedAt })
        .from(careSafetyPlans)
        .where(eq(careSafetyPlans.userId, userId))
        .limit(1);
      return row ?? null;
    },

    async saveSafetyPlan(userId, sealed) {
      const [row] = await client
        .insert(careSafetyPlans)
        .values({ userId, sealed })
        .onConflictDoUpdate({
          target: careSafetyPlans.userId,
          set: { sealed, updatedAt: new Date() },
        })
        .returning({ sealed: careSafetyPlans.sealed, updatedAt: careSafetyPlans.updatedAt });
      if (row === undefined) throw new Error('The safety plan was not stored');
      return row;
    },
  };
}

export const careRepository = createCareRepository();
