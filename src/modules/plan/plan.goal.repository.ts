/**
 * Rencana's goals data access (AGENTS.md Rules 4 and 10): the goals with what is saved in each,
 * and their deposits. The emergency fund's unique index refuses a second one; a deposit's id is
 * the app's, so a retry stores nothing twice.
 */

import { and, asc, desc, eq, sql } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { db } from '../../db/client/index.ts';
import { goalDeposits, goals, type GoalInputs } from '../../db/schema/schema.ts';
import type { GOAL_KIND } from '../../lib/constants/plan.ts';
import { GoalEmergencyExistsError } from './plan.errors.ts';

type GoalKind = (typeof GOAL_KIND)[keyof typeof GOAL_KIND];

export type GoalRow = {
  id: string;
  kind: GoalKind;
  name: string;
  inputs: GoalInputs;
  initialAmount: number;
  monthlyDeposit: number;
  targetAmount: number;
  targetDate: string;
  inBudget: boolean;
  createdAt: Date;
  updatedAt: Date;
  /** `initialAmount` plus every deposit. */
  savedAmount: number;
};

type NewGoal = Omit<GoalRow, 'id' | 'createdAt' | 'updatedAt' | 'savedAmount'>;
type GoalPatch = { [K in keyof Omit<NewGoal, 'kind'>]?: NewGoal[K] | undefined };
type DepositRow = { id: string; goalId: string; amount: number; depositedOn: string };

export type GoalRepository = {
  /** The emergency fund first, then the newest. */
  listGoals(userId: string): Promise<GoalRow[]>;
  findGoal(userId: string, id: string): Promise<GoalRow | null>;
  /** Throws GoalEmergencyExistsError for a second emergency fund. */
  insertGoal(userId: string, goal: NewGoal, isEmergency: boolean): Promise<GoalRow>;
  updateGoal(userId: string, id: string, patch: GoalPatch): Promise<boolean>;
  /** Newest first. */
  listDeposits(goalId: string): Promise<DepositRow[]>;
  /** Every deposit of the person's goals, oldest first, for Unduh Datamu. */
  listAllDeposits(userId: string): Promise<(DepositRow & { goalName: string })[]>;
  /** Stores the deposit once; answers the stored row for its id, which may be another goal's. */
  insertDeposit(deposit: DepositRow): Promise<DepositRow>;
};

/** Postgres's unique_violation. */
const UNIQUE_VIOLATION = '23505';
const EMERGENCY_INDEX = 'goals_emergency_owner_idx';

/** Whether `error`, or an error it wraps (Drizzle wraps the driver's), broke the emergency index. */
function violatesEmergency(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false;
  if (
    Reflect.get(error, 'code') === UNIQUE_VIOLATION &&
    Reflect.get(error, 'constraint_name') === EMERGENCY_INDEX
  ) {
    return true;
  }
  return violatesEmergency(Reflect.get(error, 'cause'));
}

/**
 * What a goal has saved: its starting amount plus every deposit. Written with table-qualified
 * names, because Drizzle drops the table from a single-table select and an unqualified "id" inside
 * the subquery would be the deposit's own.
 */
const savedAmount =
  sql<number>`"goals"."initial_amount" + coalesce((select sum("goal_deposits"."amount") from "goal_deposits" where "goal_deposits"."goal_id" = "goals"."id"), 0)`.mapWith(
    Number,
  );

const goalColumns = {
  id: goals.id,
  kind: goals.kind,
  name: goals.name,
  inputs: goals.inputs,
  initialAmount: goals.initialAmount,
  monthlyDeposit: goals.monthlyDeposit,
  targetAmount: goals.targetAmount,
  targetDate: goals.targetDate,
  inBudget: goals.inBudget,
  createdAt: goals.createdAt,
  updatedAt: goals.updatedAt,
  savedAmount,
};

const depositColumns = {
  id: goalDeposits.id,
  goalId: goalDeposits.goalId,
  amount: goalDeposits.amount,
  depositedOn: goalDeposits.depositedOn,
};

export function createGoalRepository(client: PostgresJsDatabase = db): GoalRepository {
  async function findGoal(userId: string, id: string): Promise<GoalRow | null> {
    const [row] = await client
      .select(goalColumns)
      .from(goals)
      .where(and(eq(goals.userId, userId), eq(goals.id, id)))
      .limit(1);
    return row ?? null;
  }

  return {
    listGoals(userId) {
      return client
        .select(goalColumns)
        .from(goals)
        .where(eq(goals.userId, userId))
        .orderBy(sql`${goals.emergencyOwner} is null`, desc(goals.createdAt));
    },

    findGoal,

    async insertGoal(userId, goal, isEmergency) {
      try {
        const [row] = await client
          .insert(goals)
          .values({ userId, ...goal, emergencyOwner: isEmergency ? userId : null })
          .returning({ id: goals.id });
        const stored = row ? await findGoal(userId, row.id) : null;
        if (!stored) throw new Error('The inserted goal could not be read back.');
        return stored;
      } catch (error) {
        if (violatesEmergency(error)) throw new GoalEmergencyExistsError();
        throw error;
      }
    },

    async updateGoal(userId, id, patch) {
      const rows = await client
        .update(goals)
        .set(patch)
        .where(and(eq(goals.userId, userId), eq(goals.id, id)))
        .returning({ id: goals.id });
      return rows.length > 0;
    },

    listDeposits(goalId) {
      return client
        .select(depositColumns)
        .from(goalDeposits)
        .where(eq(goalDeposits.goalId, goalId))
        .orderBy(desc(goalDeposits.depositedOn), desc(goalDeposits.createdAt));
    },

    listAllDeposits(userId) {
      return client
        .select({ ...depositColumns, goalName: goals.name })
        .from(goalDeposits)
        .innerJoin(goals, eq(goals.id, goalDeposits.goalId))
        .where(eq(goals.userId, userId))
        .orderBy(asc(goalDeposits.depositedOn), asc(goalDeposits.createdAt));
    },

    async insertDeposit(deposit) {
      await client
        .insert(goalDeposits)
        .values(deposit)
        .onConflictDoNothing({ target: goalDeposits.id });
      const [row] = await client
        .select(depositColumns)
        .from(goalDeposits)
        .where(eq(goalDeposits.id, deposit.id))
        .limit(1);
      return row ?? deposit;
    },
  };
}

export const goalRepository = createGoalRepository();
