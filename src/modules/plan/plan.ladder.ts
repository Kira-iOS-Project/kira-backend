/**
 * Rencana's Tangga Keuanganmu (REN-01) and the calculators' prefill (REN-02). The rungs read the
 * score engine's facts from the health check and the open debts:
 * 1 Lunasi Utang Mahal: done with no consumer debt left; names the account being paid now.
 * 2 Dana Darurat: done once the fund reaches the engine's target multiple of essential spending.
 *   With a Dana Darurat goal the rung follows the goal, as its card does: its saved amount
 *   against its own target, the multiple from the pokok typed into the calculator. Without one,
 *   the health check's fund and target (the emergency-fund wallet takes over: a follow-up).
 * 3 Proteksi: done with both health cover and income cover.
 * 4 Investasi Bertahap: a suggestion, never locked or done.
 * Only the first rung not done is current (rung 4 once 1–3 are done); the rest are todo. Before the
 * health check every rung is todo with no detail. Prefill's monthlyIncome is the health check's net
 * income (KuisRisiko's Q5).
 */

import { PREFILL_MONTHS } from '../../lib/constants/ladder.ts';
import { MARITAL_STATUS } from '../../lib/constants/profile.ts';
import { addMonths, monthStart, wibDate, wibStartOfDay } from '../../lib/time/wib.ts';
import { GOAL_KIND, LADDER_STATUS, PLAN_LADDER_STEP } from '../../lib/constants/plan.ts';
import { payingNowOf } from '../payoff/index.ts';
import { factsOf, findScoreInput, isConsumerDebt, type ScoreInput } from '../score/index.ts';
import { goalRepository } from './plan.goal.repository.ts';
import { ladderRepository, type LadderRepository } from './plan.ladder.repository.ts';
import { ESSENTIAL_EXPENSE_INPUT, type LadderStep, type PlanPrefill } from './plan.schema.ts';

type LadderDetail = LadderStep['detail'];

export type LadderDeps = {
  scoreInput?: (userId: string) => Promise<ScoreInput | null>;
  payingNow?: (userId: string) => Promise<{ id: string; name: string } | null>;
  /** The Dana Darurat goal's saved amount, target and pokok, or null without that goal. */
  emergencyGoal?: (userId: string) => Promise<EmergencyGoal | null>;
  repository?: LadderRepository;
  now?: () => Date;
};

const EMPTY: LadderDetail = {
  debtName: null,
  amount: null,
  target: null,
  multiple: null,
  targetMultiple: null,
  health: null,
  incomeCover: null,
};

const KEYS = [
  PLAN_LADDER_STEP.payOffDebt,
  PLAN_LADDER_STEP.emergencyFund,
  PLAN_LADDER_STEP.protection,
  PLAN_LADDER_STEP.invest,
] as const;

/** One decimal, as Rencana writes it ("Sekarang 1,1× pengeluaran pokok"). */
const oneDecimal = (value: number) => Math.round(value * 10) / 10;

export type EmergencyGoal = {
  id: string;
  saved: number;
  target: number;
  monthlyDeposit: number;
  essential: number | null;
};

/** The Dana Darurat goal: saved (initial amount and deposits), target, and the pokok typed in. */
export async function emergencyGoalOf(userId: string): Promise<EmergencyGoal | null> {
  const goals = await goalRepository.listGoals(userId);
  const goal = goals.find((row) => row.kind === GOAL_KIND.emergencyFund);
  if (!goal) return null;
  const essential = goal.inputs[ESSENTIAL_EXPENSE_INPUT];
  return {
    id: goal.id,
    saved: goal.savedAmount,
    target: goal.targetAmount,
    monthlyDeposit: goal.monthlyDeposit,
    essential: typeof essential === 'number' && essential > 0 ? essential : null,
  };
}

/** Only the first rung not done is current; rung 4 is never done, so it is current after 1–3. */
function statusesOf(done: [boolean, boolean, boolean]) {
  const current = [...done, false].findIndex((isDone) => !isDone);
  return [...done, false].map((isDone, index) => {
    if (isDone) return LADDER_STATUS.done;
    return index === current ? LADDER_STATUS.current : LADDER_STATUS.todo;
  });
}

export async function ladderOf(userId: string, deps: LadderDeps = {}): Promise<LadderStep[]> {
  const input = await (deps.scoreInput ?? findScoreInput)(userId);
  if (!input) {
    return KEYS.map((key, index) => ({
      step: index + 1,
      key,
      status: LADDER_STATUS.todo,
      detail: EMPTY,
    }));
  }
  const facts = factsOf(input);
  const consumer = input.debts.filter(isConsumerDebt);
  const [payingNow, goal] = await Promise.all([
    consumer.length > 0 ? (deps.payingNow ?? payingNowOf)(userId) : null,
    (deps.emergencyGoal ?? emergencyGoalOf)(userId),
  ]);
  const fund = goal?.saved ?? facts.liquid;
  const essential = goal ? (goal.essential ?? facts.essential) : facts.essential;
  const target = goal?.target ?? facts.targetMultiple * facts.essential;
  const targetMultiple =
    goal && essential > 0 ? Math.round(target / essential) : facts.targetMultiple;
  const done: [boolean, boolean, boolean] = [
    consumer.length === 0,
    target > 0 && fund >= target,
    facts.health && facts.incomeCover,
  ];
  const details: LadderDetail[] = [
    Object.assign({}, EMPTY, {
      debtName: payingNow?.name ?? null,
      amount: consumer.reduce((sum, debt) => sum + debt.remaining, 0),
    }),
    Object.assign({}, EMPTY, {
      amount: fund,
      target,
      multiple: essential > 0 ? oneDecimal(fund / essential) : null,
      targetMultiple,
    }),
    Object.assign({}, EMPTY, { health: facts.health, incomeCover: facts.incomeCover }),
    EMPTY,
  ];
  const statuses = statusesOf(done);
  return KEYS.map((key, index) => ({
    step: index + 1,
    key,
    status: statuses[index] ?? LADDER_STATUS.todo,
    detail: details[index] ?? EMPTY,
  }));
}

/**
 * Pengeluaran pokok is the average essential spending of the last three whole WIB months that have
 * any (lane REN-02: "rata-rata catatan 3 bulan"), else the health check's figure; the fund, marital
 * status and dependants come from the health check.
 */
export async function prefillOf(userId: string, deps: LadderDeps = {}): Promise<PlanPrefill> {
  const repository = deps.repository ?? ladderRepository;
  const thisMonth = monthStart(wibDate((deps.now ?? (() => new Date()))()));
  const [input, goal, months] = await Promise.all([
    (deps.scoreInput ?? findScoreInput)(userId),
    (deps.emergencyGoal ?? emergencyGoalOf)(userId),
    repository.essentialByMonth(
      userId,
      wibStartOfDay(addMonths(thisMonth, -PREFILL_MONTHS)),
      wibStartOfDay(thisMonth),
    ),
  ]);
  const recorded = months.filter((month) => month.total > 0);
  const average =
    recorded.length > 0
      ? Math.round(recorded.reduce((sum, month) => sum + month.total, 0) / recorded.length)
      : null;
  return {
    essentialExpense: average ?? input?.essential ?? null,
    emergencyFund: goal?.saved ?? input?.emergencyFund ?? null,
    married: input?.maritalStatus ? input.maritalStatus === MARITAL_STATUS.married : null,
    dependants: input ? input.dependents : null,
    monthlyIncome: input?.income ?? null,
  };
}
