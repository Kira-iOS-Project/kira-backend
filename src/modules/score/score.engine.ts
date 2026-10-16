/**
 * The Kira Score engine: six indicators from the health-check answers, each 0–100, their three
 * groups, the score (their plain average) and its band. Pure and deterministic; the methodology is
 * the one KiraScore's "Gimana Ngitungnya?" explains, after the FinHealth Score.
 */

import {
  DEBT_KIND,
  DEBT_PAYMENT_STATUS,
  MARITAL_STATUS,
  PROTECTION,
} from '../../lib/constants/profile.ts';
import { INDICATOR, INDICATOR_GROUP, SCORE_BAND } from '../../lib/constants/score.ts';

type Values<T> = T[keyof T];
export type IndicatorKey = Values<typeof INDICATOR>;
export type IndicatorGroup = Values<typeof INDICATOR_GROUP>;
export type ScoreBand = Values<typeof SCORE_BAND>;
export type IndicatorPoints = Record<IndicatorKey, number>;

/** An open debt account: one not paid off yet. */
export type DebtInput = {
  kind: Values<typeof DEBT_KIND>;
  name: string;
  remaining: number;
  monthlyInstalment: number;
  paymentStatus: Values<typeof DEBT_PAYMENT_STATUS>;
};

/** The health-check answers; a skipped amount is null. */
export type ScoreInput = {
  income: number | null;
  essential: number | null;
  emergencyFund: number | null;
  monthlySavings: number | null;
  otherAssets: number | null;
  propertyAssets: number | null;
  dependents: number;
  maritalStatus: Values<typeof MARITAL_STATUS> | null;
  protections: Values<typeof PROTECTION>[];
  debts: DebtInput[];
};

/** The numbers the six indicators read, derived once from the answers. */
export type Facts = {
  income: number;
  essential: number;
  liquid: number;
  savings: number;
  instalments: number;
  totalDebt: number;
  totalAssets: number;
  platforms: number;
  anyLate: boolean;
  anyOverdue: boolean;
  health: boolean;
  incomeCover: boolean;
  targetMultiple: number;
};

/** One rung of an indicator's Aturan Nilai: from `lower` up to `upper`, in the indicator's unit. */
export type Rung = { points: number; lower: number | null; upper: number | null };

const CONSUMER_KINDS = new Set<string>([
  DEBT_KIND.paylater,
  DEBT_KIND.onlineLoan,
  DEBT_KIND.creditCard,
]);

export function isConsumerDebt(debt: DebtInput): boolean {
  return CONSUMER_KINDS.has(debt.kind);
}

/** Dana darurat target: 6× single, 9× married, plus 3× a dependent, at most 15×. */
export function targetMultipleOf(input: Pick<ScoreInput, 'maritalStatus' | 'dependents'>): number {
  const base = input.maritalStatus === MARITAL_STATUS.married ? 9 : 6;
  return Math.min(15, base + 3 * input.dependents);
}

/** Rising ladders score "at least `lower`"; falling ladders score "below the first `upper`, then up to each". */
export function emergencyFundLadder(target: number): Rung[] {
  return [
    { points: 100, lower: target, upper: null },
    { points: 75, lower: target / 2, upper: target },
    { points: 50, lower: 1, upper: target / 2 },
    { points: 25, lower: 0.5, upper: 1 },
    { points: 0, lower: null, upper: 0.5 },
  ];
}

export const SAVINGS_LADDER: Rung[] = [
  { points: 100, lower: 20, upper: null },
  { points: 75, lower: 10, upper: 20 },
  { points: 45, lower: 5, upper: 10 },
  { points: 25, lower: 1, upper: 5 },
  { points: 0, lower: null, upper: 1 },
];

export const INSTALMENT_LADDER: Rung[] = [
  { points: 100, lower: null, upper: 10 },
  { points: 85, lower: 10, upper: 15 },
  { points: 70, lower: 15, upper: 30 },
  { points: 40, lower: 30, upper: 40 },
  { points: 0, lower: 40, upper: null },
];

export const DEBT_TO_ASSET_LADDER: Rung[] = [
  { points: 100, lower: null, upper: 20 },
  { points: 80, lower: 20, upper: 40 },
  { points: 50, lower: 40, upper: 50 },
  { points: 25, lower: 50, upper: 70 },
  { points: 0, lower: 70, upper: null },
];

function risingPoints(value: number, ladder: Rung[]): number {
  return ladder.find((rung) => rung.lower === null || value >= rung.lower)?.points ?? 0;
}

/** The best rung is strict ("di bawah 10%"); the others include their upper bound. */
function fallingPoints(value: number, ladder: Rung[]): number {
  const rung = ladder.find(
    (step, index) =>
      step.upper === null || (index === 0 ? value < step.upper : value <= step.upper),
  );
  return rung?.points ?? 0;
}

export function factsOf(input: ScoreInput): Facts {
  const consumer = input.debts.filter(isConsumerDebt);
  const sum = (pick: (debt: DebtInput) => number) =>
    input.debts.reduce((total, debt) => total + pick(debt), 0);
  return {
    income: input.income ?? 0,
    essential: input.essential ?? 0,
    liquid: input.emergencyFund ?? 0,
    savings: input.monthlySavings ?? 0,
    instalments: sum((debt) => debt.monthlyInstalment),
    totalDebt: sum((debt) => debt.remaining),
    totalAssets:
      (input.emergencyFund ?? 0) + (input.otherAssets ?? 0) + (input.propertyAssets ?? 0),
    platforms: consumer.length,
    anyLate: consumer.some((debt) => debt.paymentStatus === DEBT_PAYMENT_STATUS.late),
    anyOverdue: consumer.some((debt) => debt.paymentStatus === DEBT_PAYMENT_STATUS.overdue),
    health: input.protections.some(
      (item) => item === PROTECTION.bpjsHealth || item === PROTECTION.privateHealth,
    ),
    incomeCover: input.protections.some(
      (item) => item === PROTECTION.bpjsEmployment || item === PROTECTION.lifeInsurance,
    ),
    targetMultiple: targetMultipleOf(input),
  };
}

function consumerDebtPoints(facts: Facts): number {
  if (facts.anyOverdue) return 0;
  if (facts.anyLate) return 25;
  if (facts.platforms === 0) return 100;
  if (facts.platforms === 1) return 75;
  return facts.platforms <= 3 ? 50 : 25;
}

export function pointsOf(facts: Facts): IndicatorPoints {
  const { income, essential, totalDebt, totalAssets } = facts;
  return {
    [INDICATOR.emergencyFund]:
      essential > 0
        ? risingPoints(facts.liquid / essential, emergencyFundLadder(facts.targetMultiple))
        : 0,
    [INDICATOR.savingsRatio]:
      income > 0 ? risingPoints((facts.savings * 100) / income, SAVINGS_LADDER) : 0,
    [INDICATOR.instalmentRatio]:
      facts.instalments === 0 && totalDebt === 0
        ? 100
        : income > 0
          ? fallingPoints((facts.instalments * 100) / income, INSTALMENT_LADDER)
          : 0,
    [INDICATOR.consumerDebt]: consumerDebtPoints(facts),
    [INDICATOR.debtToAsset]:
      totalDebt === 0
        ? 100
        : totalAssets > 0
          ? fallingPoints((totalDebt * 100) / totalAssets, DEBT_TO_ASSET_LADDER)
          : 0,
    [INDICATOR.protection]: (facts.health ? 50 : 0) + (facts.incomeCover ? 50 : 0),
  };
}

/** The plain average of the six, rounded half up (61,7 → 62). */
export function scoreOf(points: IndicatorPoints): number {
  const values = Object.values(points);
  return Math.round(values.reduce((total, value) => total + value, 0) / values.length);
}

/** Rentan 0–39, Bertahan 40–79, Sehat 80–100. */
export function bandOf(points: number): ScoreBand {
  if (points >= 80) return SCORE_BAND.healthy;
  return points >= 40 ? SCORE_BAND.coping : SCORE_BAND.vulnerable;
}

export const GROUP_OF: Record<IndicatorKey, IndicatorGroup> = {
  [INDICATOR.emergencyFund]: INDICATOR_GROUP.save,
  [INDICATOR.savingsRatio]: INDICATOR_GROUP.save,
  [INDICATOR.instalmentRatio]: INDICATOR_GROUP.debt,
  [INDICATOR.consumerDebt]: INDICATOR_GROUP.debt,
  [INDICATOR.debtToAsset]: INDICATOR_GROUP.debt,
  [INDICATOR.protection]: INDICATOR_GROUP.protect,
};

/** Tabung, Utang and Lindungi: the rounded average of the indicators in each. */
export function groupsOf(points: IndicatorPoints) {
  return Object.values(INDICATOR_GROUP).map((group) => {
    const members = Object.values(INDICATOR)
      .filter((key) => GROUP_OF[key] === group)
      .map((key) => points[key]);
    const value = Math.round(members.reduce((total, item) => total + item, 0) / members.length);
    return { group, points: value, band: bandOf(value) };
  });
}

/** The score's band, held at Rentan while consumer debt scores 0 (KiraScore's cap). */
export function scoreBandOf(score: number, points: IndicatorPoints): ScoreBand {
  return points[INDICATOR.consumerDebt] === 0 ? SCORE_BAND.vulnerable : bandOf(score);
}
