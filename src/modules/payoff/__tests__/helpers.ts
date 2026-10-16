/**
 * Fixtures and mock builders for the payoff module (AGENTS.md Rule 19). The accounts are Dinda's
 * consumer debts from the Rencana Pelunasan board: two paylater and an online loan, and a
 * motorbike instalment that stays out of the plan.
 */

import { DEBT_KIND } from '../../../lib/constants/profile.ts';
import type { PayoffDebt } from '../payoff.engine.ts';
import type { OpenDebt, PayoffRepository } from '../payoff.repository.ts';

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
  }),
];

export function createPayoffRepositoryMock(
  overrides: Partial<PayoffRepository> = {},
): PayoffRepository {
  return { listOpenDebts: async () => DINDA_OPEN, ...overrides };
}
