/**
 * Fixtures and mock builders for the score module (AGENTS.md Rule 19). `DINDA` is the person of
 * the KiraScore and DetailIndikator boards: 1,1× emergency fund, 8% saved, 18% in instalments,
 * paylater on two platforms, 32% debt to assets and both BPJS, which the boards score 66.
 */

import {
  DEBT_KIND,
  DEBT_PAYMENT_STATUS,
  FOCUS,
  MARITAL_STATUS,
  PROTECTION,
} from '../../../lib/constants/profile.ts';
import type { DebtInput, ScoreInput } from '../score.engine.ts';
import { SNAPSHOT_REASON } from '../../../lib/constants/score.ts';
import { factsOf, pointsOf } from '../score.engine.ts';
import type { HistorySnapshot, ScoreHistoryRepository } from '../score.history.repository.ts';
import { labelsOf } from '../score.labels.ts';
import { evaluate } from '../score.measure.ts';
import type { ScoreRepository } from '../score.repository.ts';

export const NOW = new Date('2026-10-16T05:00:00.000Z');

export function debt(overrides: Partial<DebtInput> = {}): DebtInput {
  return {
    kind: DEBT_KIND.paylater,
    name: 'Paylater A',
    remaining: 420_000,
    monthlyInstalment: 210_000,
    paymentStatus: DEBT_PAYMENT_STATUS.onTime,
    ...overrides,
  };
}

export const DINDA_DEBTS: DebtInput[] = [
  Object.assign({ id: 'paylater-a' }, debt()),
  Object.assign(
    { id: 'paylater-b' },
    debt({ name: 'Paylater B', remaining: 890_000, monthlyInstalment: 290_000 }),
  ),
  Object.assign(
    { id: 'motor' },
    debt({
      kind: DEBT_KIND.vehicle,
      name: 'Cicilan Motor',
      remaining: 13_000_000,
      monthlyInstalment: 850_000,
    }),
  ),
];

export const DINDA_ANSWERS: Omit<ScoreInput, 'debts'> = {
  income: 7_500_000,
  essential: 4_200_000,
  emergencyFund: 4_800_000,
  monthlySavings: 600_000,
  otherAssets: 2_900_000,
  propertyAssets: 37_000_000,
  dependents: 0,
  maritalStatus: MARITAL_STATUS.single,
  protections: [PROTECTION.bpjsHealth, PROTECTION.bpjsEmployment],
};

export const DINDA: ScoreInput = { ...DINDA_ANSWERS, debts: DINDA_DEBTS };

export function input(overrides: Partial<ScoreInput> = {}): ScoreInput {
  return { ...DINDA, ...overrides };
}

export function createScoreRepositoryMock(
  overrides: Partial<ScoreRepository> = {},
): ScoreRepository {
  return {
    findState: async () => ({
      focus: FOCUS.trackSpending,
      payday: { day: 25, endOfMonth: false },
      input: DINDA_ANSWERS,
    }),
    listOpenDebts: async () => DINDA_DEBTS,
    snapshotHistory: async () => ({ count: 1, latestInPeriodAt: NOW, previousScore: null }),
    insertSnapshot: async () => undefined,
    saveHealthCheck: async () => undefined,
    ...overrides,
  };
}

export function createScoreHistoryRepositoryMock(
  overrides: Partial<ScoreHistoryRepository> = {},
): ScoreHistoryRepository {
  return {
    listHistory: async () => [],
    findPrevious: async () => null,
    listMonthlyCandidates: async () => [],
    insertMonthlySnapshot: async () => true,
    listSnapshots: async () => [],
    ...overrides,
  };
}

/** Dinda's points and figures, as a snapshot of her score keeps them. */
export const POINTS = pointsOf(factsOf(DINDA));
export const LABELS = labelsOf(evaluate(DINDA));

/** A plotted snapshot: September's monthly point unless `overrides` say otherwise. */
export function snapshot(overrides: Partial<HistorySnapshot> = {}): HistorySnapshot {
  return {
    reason: SNAPSHOT_REASON.monthly,
    periodStart: '2026-09-25',
    createdAt: new Date('2026-09-25T00:00:00.000Z'),
    score: 62,
    indicators: POINTS,
    measures: LABELS,
    ...overrides,
  };
}

/** The monthly point of `month` (`YYYY-MM`) at `score`. */
export function monthly(month: string, score: number): HistorySnapshot {
  return snapshot({
    periodStart: `${month}-25`,
    createdAt: new Date(`${month}-25T00:00:00.000Z`),
    score,
  });
}
