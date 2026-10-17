/**
 * Rencana's goals (REN-02 to REN-05): saving what the app's calculator computed, the goal's
 * deposits, and the emergency fund's milestones (1 minggu = pokok × 7/30, 1 bulan, 3× and the
 * target), each with the day the saved amount first reached it.
 */

import { EMERGENCY_MILESTONE, GOAL_KIND } from '../../lib/constants/plan.ts';
import { UnprocessableError } from '../../lib/errors/errors.ts';
import { wibDate } from '../../lib/time/wib.ts';
import { GoalDepositConflictError, GoalNotFoundError } from './plan.errors.ts';
import { goalRepository, type GoalRepository, type GoalRow } from './plan.goal.repository.ts';
import type {
  CreateGoalBody,
  Goal,
  GoalDeposit,
  GoalDepositBody,
  GoalDetail,
  GoalSummary,
  UpdateGoalBody,
} from './plan.schema.ts';
import { ESSENTIAL_EXPENSE_INPUT } from './plan.schema.ts';

type Deps = { repository?: GoalRepository };

/** Whether the inputs name a positive whole monthly essential spending. */
function hasEssentialExpense(inputs: Goal['inputs']): boolean {
  const essential = inputs[ESSENTIAL_EXPENSE_INPUT];
  return typeof essential === 'number' && Number.isInteger(essential) && essential > 0;
}

function summaryOf(row: GoalRow): GoalSummary {
  const { id, kind, name, targetAmount, targetDate, monthlyDeposit, savedAmount } = row;
  return { id, kind, name, targetAmount, targetDate, monthlyDeposit, savedAmount };
}

function goalOf(row: GoalRow): Goal {
  return {
    ...summaryOf(row),
    inputs: row.inputs,
    initialAmount: row.initialAmount,
    inBudget: row.inBudget,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/**
 * The emergency fund's milestones from its monthly essential spending, each reached on the first
 * day the saved amount (what was saved when the goal was made, then each deposit in order) got to
 * it. Any other goal, or one without that input, has none.
 */
export function milestonesOf(
  row: GoalRow,
  depositsNewestFirst: readonly GoalDeposit[],
): GoalDetail['milestones'] {
  const essential = row.inputs[ESSENTIAL_EXPENSE_INPUT];
  if (row.kind !== GOAL_KIND.emergencyFund || typeof essential !== 'number' || essential <= 0) {
    return [];
  }
  const steps = [
    { key: EMERGENCY_MILESTONE.oneWeek, amount: Math.round((essential * 7) / 30) },
    { key: EMERGENCY_MILESTONE.oneMonth, amount: essential },
    { key: EMERGENCY_MILESTONE.threeMonths, amount: essential * 3 },
    { key: EMERGENCY_MILESTONE.target, amount: row.targetAmount },
  ];
  /** By day; a deposit is never dated before its goal (addGoalDeposit refuses it). */
  const timeline = [{ day: wibDate(row.createdAt), amount: row.initialAmount }]
    .concat(
      depositsNewestFirst.toReversed().map((deposit) => ({
        day: deposit.depositedOn,
        amount: deposit.amount,
      })),
    )
    .toSorted((a, b) => a.day.localeCompare(b.day));
  let saved = 0;
  const totals = timeline.map(({ day, amount }) => {
    saved += amount;
    return { day, saved };
  });
  return steps.map(({ key, amount }) => ({
    key,
    amount,
    reachedOn: totals.find((point) => point.saved >= amount)?.day ?? null,
  }));
}

export async function listGoalSummaries(userId: string, deps: Deps = {}): Promise<GoalSummary[]> {
  const repository = deps.repository ?? goalRepository;
  return (await repository.listGoals(userId)).map(summaryOf);
}

export async function createGoal(
  userId: string,
  body: CreateGoalBody,
  deps: Deps = {},
): Promise<Goal> {
  const repository = deps.repository ?? goalRepository;
  const row = await repository.insertGoal(userId, body, body.kind === GOAL_KIND.emergencyFund);
  return goalOf(row);
}

async function requireGoal(repository: GoalRepository, userId: string, id: string) {
  const row = await repository.findGoal(userId, id);
  if (!row) throw new GoalNotFoundError();
  return row;
}

export async function getGoalDetail(
  userId: string,
  id: string,
  deps: Deps = {},
): Promise<GoalDetail> {
  const repository = deps.repository ?? goalRepository;
  const row = await requireGoal(repository, userId, id);
  const deposits = (await repository.listDeposits(id)).map(
    ({ id: depositId, amount, depositedOn }) => ({
      id: depositId,
      amount,
      depositedOn,
    }),
  );
  return { ...goalOf(row), deposits, milestones: milestonesOf(row, deposits) };
}

export async function updateGoal(
  userId: string,
  id: string,
  body: UpdateGoalBody,
  deps: Deps = {},
): Promise<Goal> {
  const repository = deps.repository ?? goalRepository;
  const row = await requireGoal(repository, userId, id);
  if (row.kind === GOAL_KIND.emergencyFund && body.inputs && !hasEssentialExpense(body.inputs)) {
    throw new UnprocessableError(
      `An emergency fund keeps inputs.${ESSENTIAL_EXPENSE_INPUT}, its monthly essential spending.`,
      undefined,
      'VALIDATION_FAILED',
    );
  }
  if (!(await repository.updateGoal(userId, id, body))) throw new GoalNotFoundError();
  return goalOf(await requireGoal(repository, userId, id));
}

/**
 * Records the deposit once. The same id again on the same goal answers the stored deposit; an id
 * already used on another goal, anyone's, is refused without saying whose.
 */
/** Hapus Tujuan: the goal and its deposits go; another person's or an unknown goal is 404. */
export async function deleteGoal(userId: string, id: string, deps: Deps = {}): Promise<void> {
  const repository = deps.repository ?? goalRepository;
  if (!(await repository.deleteGoal(userId, id))) throw new GoalNotFoundError();
}

export async function addGoalDeposit(
  userId: string,
  id: string,
  body: GoalDepositBody,
  deps: Deps = {},
): Promise<GoalDeposit> {
  const repository = deps.repository ?? goalRepository;
  const row = await requireGoal(repository, userId, id);
  /**
   * Before the goal existed there was nothing to put money aside for. Checked before the insert:
   * a retried id carries the day it was first accepted with, so a retry passes too.
   */
  if (body.depositedOn < wibDate(row.createdAt)) {
    throw new UnprocessableError(
      'A deposit cannot be dated before its goal was made.',
      undefined,
      'VALIDATION_FAILED',
    );
  }
  const stored = await repository.insertDeposit({
    id: body.depositId,
    goalId: id,
    amount: body.amount,
    depositedOn: body.depositedOn,
  });
  if (stored.goalId !== id) throw new GoalDepositConflictError();
  return { id: stored.id, amount: stored.amount, depositedOn: stored.depositedOn };
}
