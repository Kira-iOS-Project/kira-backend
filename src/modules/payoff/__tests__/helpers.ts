/**
 * Fixtures and mock builders for the payoff module (AGENTS.md Rule 19). The accounts are Dinda's
 * consumer debts from the Rencana Pelunasan board: two paylater and an online loan, and a
 * motorbike instalment that stays out of the plan.
 */

import { DEBT_KIND, DEBT_PAYMENT_STATUS } from '../../../lib/constants/profile.ts';
import type { PayoffDebt } from '../payoff.engine.ts';
import type { PlanDebt, PlanRepository, StoredPlan } from '../payoff.plan.repository.ts';
import type { OpenDebt, PayoffRepository } from '../payoff.repository.ts';

export const ID_A = '00000000-0000-4000-8000-000000000001';
export const ID_B = '00000000-0000-4000-8000-000000000002';
export const ID_MOTOR = '00000000-0000-4000-8000-000000000003';

export const NOW = new Date('2026-10-16T05:00:00.000Z');

export function payoffDebt(overrides: Partial<PayoffDebt> = {}): PayoffDebt {
  return {
    id: '00000000-0000-4000-8000-000000000001',
    kind: DEBT_KIND.paylater,
    name: 'Paylater A',
    remaining: 420_000,
    monthlyInstalment: 210_000,
    annualInterestRate: null,
    dueDay: null,
    ...overrides,
  };
}

export const DINDA_OPEN: OpenDebt[] = [
  payoffDebt({ annualInterestRate: 24, dueDay: 5 }),
  payoffDebt({
    id: '00000000-0000-4000-8000-000000000002',
    name: 'Paylater B',
    remaining: 890_000,
    monthlyInstalment: 290_000,
    annualInterestRate: 36,
  }),
  payoffDebt({
    id: '00000000-0000-4000-8000-000000000003',
    kind: DEBT_KIND.vehicle,
    name: 'Cicilan Motor',
    remaining: 13_000_000,
    monthlyInstalment: 850_000,
    annualInterestRate: 12,
    dueDay: 10,
  }),
];

export function createPayoffRepositoryMock(
  overrides: Partial<PayoffRepository> = {},
): PayoffRepository {
  return { listOpenDebts: async () => DINDA_OPEN, ...overrides };
}

export const PAYOFF_PLAN = {
  id: '00000000-0000-4000-8000-0000000000aa',
  method: 'snowball',
  extraPayment: 0,
  focusDebtId: null,
  createdAt: new Date('2026-10-10T03:00:00.000Z'),
} satisfies StoredPlan;

const ORIGINALS = [600_000, 1_000_000, 15_000_000];

/** Dinda's open accounts as Rencanaku reads them: what each was when added, and what is left. */
export const PLAN_DEBTS: PlanDebt[] = DINDA_OPEN.map((debt, index) =>
  Object.assign({}, debt, {
    original: ORIGINALS[index] ?? debt.remaining,
    paymentStatus: DEBT_PAYMENT_STATUS.onTime,
  }),
);

export function createPlanRepositoryMock(overrides: Partial<PlanRepository> = {}): PlanRepository {
  return {
    findActive: async () => PAYOFF_PLAN,
    listDebts: async () => PLAN_DEBTS,
    findDebt: async (_userId, debtId) => PLAN_DEBTS.find((debt) => debt.id === debtId) ?? null,
    createPlan: async (_userId, plan) => ({ ...PAYOFF_PLAN, ...plan }),
    setFocus: async () => undefined,
    listPaidSince: async () => [],
    hasPayment: async () => false,
    recordPayment: async () => 'applied',
    ...overrides,
  };
}
