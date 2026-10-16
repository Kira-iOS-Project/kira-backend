/**
 * An indicator's detail screen (DetailIndikator*): its Aturan Nilai with the rupiah each rung
 * starts and ends at, the rung above with what it takes and the score it would bring ("+4 Kira
 * Score · perkiraan 66 → 70"), and the milestones on its progress ribbon. The emergency fund counts
 * in multiples of essential spending; the ratios in percent of their base.
 */

import { INDICATOR } from '../../lib/constants/score.ts';
import {
  DEBT_TO_ASSET_LADDER,
  emergencyFundLadder,
  INSTALMENT_LADDER,
  SAVINGS_LADDER,
  scoreOf,
  type Facts,
  type IndicatorKey,
  type IndicatorPoints,
  type Rung,
} from './score.engine.ts';

type LadderRung = Rung & {
  amountLower: number | null;
  amountUpper: number | null;
  isCurrent: boolean;
};

type NextRung = {
  points: number;
  amountNeeded: number | null;
  scoreFrom: number;
  scoreTo: number;
};

export type Milestone = { at: number; label: string };

/** How an indicator's unit turns into rupiah, and which way it improves. */
type Scale = { base: number; unit: number; value: number; rising: boolean };

/** The consumer-debt and protection rungs are counts and states, with no bounds to show. */
const STATE_LADDERS: Partial<Record<IndicatorKey, Rung[]>> = {
  [INDICATOR.consumerDebt]: [100, 75, 50, 25, 0].map((points) => ({
    points,
    lower: null,
    upper: null,
  })),
  [INDICATOR.protection]: [100, 50, 0].map((points) => ({ points, lower: null, upper: null })),
};

function scaleOf(key: IndicatorKey, facts: Facts): { rungs: Rung[]; scale: Scale | null } {
  switch (key) {
    case INDICATOR.emergencyFund:
      return {
        rungs: emergencyFundLadder(facts.targetMultiple),
        scale: { base: facts.essential, unit: 1, value: facts.liquid, rising: true },
      };
    case INDICATOR.savingsRatio:
      return {
        rungs: SAVINGS_LADDER,
        scale: { base: facts.income, unit: 100, value: facts.savings, rising: true },
      };
    case INDICATOR.instalmentRatio:
      return {
        rungs: INSTALMENT_LADDER,
        scale: { base: facts.income, unit: 100, value: facts.instalments, rising: false },
      };
    case INDICATOR.debtToAsset:
      return {
        rungs: DEBT_TO_ASSET_LADDER,
        scale: { base: facts.totalAssets, unit: 100, value: facts.totalDebt, rising: false },
      };
    default:
      return { rungs: STATE_LADDERS[key] ?? [], scale: null };
  }
}

function amountAt(bound: number | null, scale: Scale | null): number | null {
  if (bound === null || scale === null || scale.base === 0) return null;
  return Math.round((bound * scale.base) / scale.unit);
}

/** Rupiah still to add (rising) or to cut (falling) to reach a rung; the top rung's 20% and 10% are strict. */
function amountNeeded(rung: Rung, isTop: boolean, scale: Scale | null): number | null {
  if (scale === null || scale.base === 0) return null;
  if (scale.rising) {
    return Math.max(0, Math.ceil(((rung.lower ?? 0) * scale.base) / scale.unit) - scale.value);
  }
  const limit = ((rung.upper ?? 0) * scale.base) / scale.unit;
  const allowed = isTop ? Math.ceil(limit) - 1 : Math.floor(limit);
  return Math.max(0, scale.value - allowed);
}

/** "1×", "7,5×": a multiple written the Indonesian way. */
function multipleLabel(multiple: number): string {
  return `${String(multiple).replace('.', ',')}×`;
}

function at(share: number, base: number): number {
  return Math.round(share * base);
}

function percents(base: number, marks: number[]): Milestone[] {
  return base === 0 ? [] : marks.map((mark) => ({ at: at(mark / 100, base), label: `${mark}%` }));
}

function milestonesOf(key: IndicatorKey, facts: Facts): Milestone[] {
  switch (key) {
    case INDICATOR.emergencyFund: {
      const target = facts.targetMultiple;
      if (facts.essential === 0) return [];
      return [1, target / 2, target].map((multiple) => ({
        at: at(multiple, facts.essential),
        label: multipleLabel(multiple),
      }));
    }
    case INDICATOR.savingsRatio:
      return percents(facts.income, [10, 20]);
    case INDICATOR.instalmentRatio:
      return percents(facts.income, [15, 30]);
    case INDICATOR.debtToAsset:
      return percents(facts.totalAssets, [25, 50]);
    default:
      return [];
  }
}

export function ladderOf(key: IndicatorKey, facts: Facts, points: IndicatorPoints) {
  const { rungs, scale } = scaleOf(key, facts);
  const current = points[key];
  const ladder: LadderRung[] = rungs.map((rung) => ({
    ...rung,
    amountLower: amountAt(rung.lower, scale),
    amountUpper: amountAt(rung.upper, scale),
    isCurrent: rung.points === current,
  }));
  const index = rungs.findIndex((rung) => rung.points === current);
  const above = index > 0 ? rungs[index - 1] : undefined;
  const scoreFrom = scoreOf(points);
  const nextRung: NextRung | null = above
    ? {
        points: above.points,
        amountNeeded: amountNeeded(above, index === 1, scale),
        scoreFrom,
        scoreTo: scoreOf({ ...points, [key]: above.points }),
      }
    : null;
  return { ladder, nextRung, milestones: milestonesOf(key, facts) };
}
