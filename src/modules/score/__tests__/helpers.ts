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
  debt(),
  debt({ name: 'Paylater B', remaining: 890_000, monthlyInstalment: 290_000 }),
  debt({
    kind: DEBT_KIND.vehicle,
    name: 'Cicilan Motor',
    remaining: 13_000_000,
    monthlyInstalment: 850_000,
  }),
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
