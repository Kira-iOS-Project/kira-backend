/**
 * Tiga Langkah Prioritas: the engine's next steps, in a fixed order (expensive debt, then the
 * emergency fund, protection, savings, instalments, debt against assets), the first three that
 * apply. Each carries its estimated gain: the score with that step done, less the score now.
 */

import { DEBT_KIND, DEBT_PAYMENT_STATUS, FOCUS, PROTECTION } from '../../lib/constants/profile.ts';
import { INDICATOR, STEP_KIND } from '../../lib/constants/score.ts';
import {
  factsOf,
  isConsumerDebt,
  pointsOf,
  scoreOf,
  type DebtInput,
  type Facts,
  type ScoreInput,
} from './score.engine.ts';

type Values<T> = T[keyof T];

export type Step = {
  kind: Values<typeof STEP_KIND>;
  estimatedGain: number;
  debtName?: string;
  remaining?: number;
  currentAmount?: number;
  targetAmount?: number;
  targetMultiple?: number;
  targetPercent?: number;
};

type Candidate = { step: Omit<Step, 'estimatedGain'>; after: Facts };

const MAX_STEPS = 3;

/** "Utang terkecil dulu": the open consumer debt with the least left to pay. */
function payOffDebt(input: ScoreInput): Candidate | null {
  const [smallest] = input.debts
    .filter(isConsumerDebt)
    .toSorted((left, right) => left.remaining - right.remaining);
  if (!smallest) return null;
  return {
    step: { kind: STEP_KIND.payOffDebt, debtName: smallest.name, remaining: smallest.remaining },
    after: factsOf({ ...input, debts: input.debts.filter((debt) => debt !== smallest) }),
  };
}

/**
 * Ajukan Keringanan (BerandaBebasUtang): for the Keluar dari Utang focus, the online loan with the
 * heaviest instalment. Its gain assumes the relief Kira's script asks for: payments back on time
 * and the instalment halved.
 */
function seekRelief(input: ScoreInput): Candidate | null {
  const [loan] = input.debts
    .filter((debt) => debt.kind === DEBT_KIND.onlineLoan)
    .toSorted((left, right) => right.monthlyInstalment - left.monthlyInstalment);
  if (!loan) return null;
  const relieved: DebtInput = {
    ...loan,
    monthlyInstalment: Math.ceil(loan.monthlyInstalment / 2),
    paymentStatus: DEBT_PAYMENT_STATUS.onTime,
  };
  return {
    step: { kind: STEP_KIND.seekRelief, debtName: loan.name, remaining: loan.remaining },
    after: factsOf({
      ...input,
      debts: input.debts.map((debt) => (debt === loan ? relieved : debt)),
    }),
  };
}

/** The next multiple of essential spending: 1×, then half the target, then the target. */
function buildEmergencyFund(input: ScoreInput, facts: Facts): Candidate | null {
  const { essential, liquid, targetMultiple } = facts;
  if (essential === 0 || liquid >= targetMultiple * essential) return null;
  const ratio = liquid / essential;
  const multiple = ratio < 1 ? 1 : ratio < targetMultiple / 2 ? targetMultiple / 2 : targetMultiple;
  const targetAmount = Math.ceil(multiple * essential);
  return {
    step: {
      kind: STEP_KIND.buildEmergencyFund,
      currentAmount: liquid,
      targetAmount,
      targetMultiple: multiple,
    },
    after: factsOf({ ...input, emergencyFund: targetAmount }),
  };
}

function addProtection(input: ScoreInput, facts: Facts): Candidate | null {
  if (facts.health && facts.incomeCover) return null;
  return {
    step: { kind: STEP_KIND.addProtection },
    after: factsOf({ ...input, protections: [PROTECTION.bpjsHealth, PROTECTION.bpjsEmployment] }),
  };
}

/** Menabung 10% dari gaji, then 20%. */
function raiseSavings(facts: Facts): Candidate | null {
  const { income, savings } = facts;
  if (income === 0 || savings * 100 >= 20 * income) return null;
  const targetPercent = savings * 100 < 10 * income ? 10 : 20;
  const targetAmount = Math.ceil((income * targetPercent) / 100);
  return {
    step: { kind: STEP_KIND.raiseSavings, currentAmount: savings, targetAmount, targetPercent },
    after: { ...facts, savings: targetAmount },
  };
}

/**
 * The amount at a falling ladder's next bound: within 40%, 30% or 15% (inclusive), or under the
 * strict 10% or 20% at the top, which needs one rupiah less than the bound.
 */
function nextBound(value: number, base: number, bounds: number[]) {
  const targetPercent = bounds.find((bound) => value * 100 > bound * base) ?? bounds.at(-1) ?? 0;
  const atTop = targetPercent === bounds.at(-1);
  const amount = atTop
    ? Math.ceil((base * targetPercent) / 100) - 1
    : Math.floor((base * targetPercent) / 100);
  return { targetPercent, targetAmount: Math.max(0, amount) };
}

function lowerInstalments(facts: Facts, points: number): Candidate | null {
  if (points === 100 || facts.income === 0) return null;
  const target = nextBound(facts.instalments, facts.income, [40, 30, 15, 10]);
  return {
    step: { kind: STEP_KIND.lowerInstalments, currentAmount: facts.instalments, ...target },
    after: { ...facts, instalments: target.targetAmount },
  };
}

function lowerDebtToAsset(facts: Facts, points: number): Candidate | null {
  if (points === 100 || facts.totalAssets === 0) return null;
  const target = nextBound(facts.totalDebt, facts.totalAssets, [70, 50, 40, 20]);
  return {
    step: { kind: STEP_KIND.lowerDebtToAsset, currentAmount: facts.totalDebt, ...target },
    after: { ...facts, totalDebt: target.targetAmount },
  };
}

/** The first three steps that apply, each with its estimated gain in score points. */
export function stepsFor(input: ScoreInput, focus: Values<typeof FOCUS>): Step[] {
  const facts = factsOf(input);
  const points = pointsOf(facts);
  const current = scoreOf(points);
  const relief = focus === FOCUS.debtFree ? seekRelief(input) : null;
  const candidates = [
    relief ?? payOffDebt(input),
    buildEmergencyFund(input, facts),
    addProtection(input, facts),
    raiseSavings(facts),
    lowerInstalments(facts, points[INDICATOR.instalmentRatio]),
    lowerDebtToAsset(facts, points[INDICATOR.debtToAsset]),
  ];
  return candidates
    .filter((candidate) => candidate !== null)
    .slice(0, MAX_STEPS)
    .map(({ step, after }) =>
      Object.assign(step, { estimatedGain: Math.max(0, scoreOf(pointsOf(after)) - current) }),
    );
}
