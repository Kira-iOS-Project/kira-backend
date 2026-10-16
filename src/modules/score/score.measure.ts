/**
 * What each indicator measured, in numbers the app turns into its own words ("1,1× pengeluaran
 * pokok", "8% dari gaji", "Paylater di 2 platform"), and the full evaluation of a set of answers.
 * Ratios read against a "≥" ladder are rounded down, so the figure shown never sits on a higher
 * rung than the points; the others are rounded to the nearest whole percent ("0,32 → 32%").
 */

import { INDICATOR } from '../../lib/constants/score.ts';
import {
  bandOf,
  factsOf,
  GROUP_OF,
  groupsOf,
  pointsOf,
  scoreBandOf,
  scoreOf,
  type Facts,
  type IndicatorKey,
  type ScoreInput,
} from './score.engine.ts';

export type IndicatorMeasure =
  | {
      ratio: number;
      liquid: number;
      essential: number;
      targetMultiple: number;
      targetAmount: number;
    }
  | { percent: number; monthlySavings: number; income: number }
  | { percent: number; monthlyInstalments: number; income: number }
  | { platforms: number; anyLate: boolean; anyOverdue: boolean }
  | { percent: number; totalDebt: number; totalAssets: number }
  | { health: boolean; income: boolean };

function percentOf(part: number, whole: number, round: (value: number) => number): number {
  return whole > 0 ? round((part * 100) / whole) : 0;
}

function measureOf(key: IndicatorKey, facts: Facts): IndicatorMeasure {
  switch (key) {
    case INDICATOR.emergencyFund:
      return {
        ratio: facts.essential > 0 ? Math.floor((facts.liquid * 10) / facts.essential) / 10 : 0,
        liquid: facts.liquid,
        essential: facts.essential,
        targetMultiple: facts.targetMultiple,
        targetAmount: facts.targetMultiple * facts.essential,
      };
    case INDICATOR.savingsRatio:
      return {
        percent: percentOf(facts.savings, facts.income, Math.floor),
        monthlySavings: facts.savings,
        income: facts.income,
      };
    case INDICATOR.instalmentRatio:
      return {
        percent: percentOf(facts.instalments, facts.income, Math.round),
        monthlyInstalments: facts.instalments,
        income: facts.income,
      };
    case INDICATOR.consumerDebt:
      return { platforms: facts.platforms, anyLate: facts.anyLate, anyOverdue: facts.anyOverdue };
    case INDICATOR.debtToAsset:
      return {
        percent: percentOf(facts.totalDebt, facts.totalAssets, Math.round),
        totalDebt: facts.totalDebt,
        totalAssets: facts.totalAssets,
      };
    default:
      return { health: facts.health, income: facts.incomeCover };
  }
}

export type Evaluation = ReturnType<typeof evaluate>;

/** Everything the score screens show for one set of answers, steps aside. */
export function evaluate(input: ScoreInput) {
  const facts = factsOf(input);
  const points = pointsOf(facts);
  const score = scoreOf(points);
  const band = scoreBandOf(score, points);
  return {
    facts,
    points,
    score,
    band,
    cappedByConsumerDebt: band !== bandOf(score),
    groups: groupsOf(points),
    indicators: Object.values(INDICATOR).map((key) => ({
      key,
      group: GROUP_OF[key],
      points: points[key],
      band: bandOf(points[key]),
      measure: measureOf(key, facts),
    })),
  };
}
