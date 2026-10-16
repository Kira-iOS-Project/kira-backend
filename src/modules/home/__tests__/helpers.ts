/**
 * Mock builders for the home module (AGENTS.md Rule 19). The defaults are Dinda on the Main board:
 * paid on the 25th, 7,5 juta income, 4,2 juta essential spending.
 */

import { FOCUS } from '../../../lib/constants/profile.ts';
import type { HomeAccount, HomeRepository } from '../home.repository.ts';

/** Friday 16 October 2026, 12.00 WIB. */
export const NOW = new Date('2026-10-16T05:00:00.000Z');

export function account(overrides: Partial<HomeAccount> = {}): HomeAccount {
  return {
    displayName: 'Dinda',
    hideBalances: false,
    focus: FOCUS.trackSpending,
    payday: { day: 25, endOfMonth: false },
    healthCheckDone: true,
    income: 7_500_000,
    essential: 4_200_000,
    emergencyFund: 4_800_000,
    ...overrides,
  };
}

export function createHomeRepositoryMock(overrides: Partial<HomeRepository> = {}): HomeRepository {
  return {
    findAccount: async () => account(),
    hasTransactions: async () => true,
    totalsBetween: async () => ({ income: 0, expense: 5_660_000, count: 12 }),
    weeklySummaryEnabled: async () => true,
    debtTotals: async () => ({ original: 20_000_000, remaining: 18_400_000 }),
    ...overrides,
  };
}
