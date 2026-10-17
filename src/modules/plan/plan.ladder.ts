/**
 * Rencana's Tangga Keuanganmu (REN-01) and the calculators' prefill (REN-02). The rungs read the
 * score engine's facts from the health check and the open debts:
 * 1 Lunasi Utang Mahal: done with no consumer debt left; names the account being paid now.
 * 2 Dana Darurat: done once the fund reaches the engine's target multiple of essential spending.
 * 3 Proteksi: done with both health cover and income cover.
 * 4 Investasi Bertahap: a suggestion, never locked or done; current once rungs 1 and 2 are done.
 * The first of rungs 1–3 not done is current, the rest todo. Before the health check every rung is
 * todo with no detail. Prefill's monthlyIncome is the health check's net income (KuisRisiko's Q5).
 */

import { PREFILL_MONTHS } from '../../lib/constants/ladder.ts';
import { LADDER_STATUS, PLAN_LADDER_STEP } from '../../lib/constants/plan.ts';
import { MARITAL_STATUS } from '../../lib/constants/profile.ts';
import { addMonths, monthStart, wibDate, wibStartOfDay } from '../../lib/time/wib.ts';
import { payingNowOf } from '../payoff/index.ts';
import { factsOf, findScoreInput, isConsumerDebt, type ScoreInput } from '../score/index.ts';
import { ladderRepository, type LadderRepository } from './plan.ladder.repository.ts';
import type { LadderStep, PlanPrefill } from './plan.schema.ts';

type LadderDetail = LadderStep['detail'];

export type LadderDeps = {
  scoreInput?: (userId: string) => Promise<ScoreInput | null>;
  payingNow?: (userId: string) => Promise<{ id: string; name: string } | null>;
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

function statusesOf(done: [boolean, boolean, boolean]) {
  const current = done.findIndex((isDone) => !isDone);
  const rungs = done.map((isDone, index) => {
    if (isDone) return LADDER_STATUS.done;
    return index === current ? LADDER_STATUS.current : LADDER_STATUS.todo;
  });
  const invest = done[0] && done[1] ? LADDER_STATUS.current : LADDER_STATUS.todo;
  return [...rungs, invest];
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
  const payingNow = consumer.length > 0 ? await (deps.payingNow ?? payingNowOf)(userId) : null;
  const target = facts.targetMultiple * facts.essential;
  const done: [boolean, boolean, boolean] = [
    consumer.length === 0,
    facts.essential > 0 && facts.liquid >= target,
    facts.health && facts.incomeCover,
  ];
  const details: LadderDetail[] = [
    Object.assign({}, EMPTY, {
      debtName: payingNow?.name ?? null,
      amount: consumer.reduce((sum, debt) => sum + debt.remaining, 0),
    }),
    Object.assign({}, EMPTY, {
      amount: facts.liquid,
      target,
      multiple: facts.essential > 0 ? oneDecimal(facts.liquid / facts.essential) : null,
      targetMultiple: facts.targetMultiple,
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
  const [input, months] = await Promise.all([
    (deps.scoreInput ?? findScoreInput)(userId),
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
    emergencyFund: input?.emergencyFund ?? null,
    married: input?.maritalStatus ? input.maritalStatus === MARITAL_STATUS.married : null,
    dependants: input ? input.dependents : null,
    monthlyIncome: input?.income ?? null,
  };
}
