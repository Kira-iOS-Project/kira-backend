/**
 * Mock builders for the account module's injected dependencies (AGENTS.md Rule 19).
 */

import { FOCUS } from '../../../lib/constants/profile.ts';
import type { AccountRepository, Profile } from '../account.repository.ts';

/** 12.41 WIB on 16 October 2026. */
export const NOW = new Date('2026-10-16T05:41:00.000Z');
export const USER_ID = '0b5c3a1e-5d4f-4c8e-9a51-6f0f2f3c7d11';

export function createProfile(overrides: Partial<Profile> = {}): Profile {
  return {
    email: 'dinda@email.com',
    displayName: 'Dinda',
    focus: FOCUS.trackSpending,
    paydayDay: null,
    paydayEndOfMonth: false,
    hideBalances: false,
    consentedAt: null,
    debtEmergencyModeUsedAt: null,
    ...overrides,
  };
}

export function createAccountRepositoryMock(
  overrides: Partial<AccountRepository> = {},
): AccountRepository {
  return {
    findProfile: async () => createProfile(),
    updateProfile: async () => undefined,
    findActiveSubscriptions: async () => [],
    findUsage: async () => null,
    latestConsents: async () => [],
    hasHealthCheck: async () => false,
    lastCategory: async () => null,
    countOpenDebts: async () => 0,
    recordConsents: async () => undefined,
    listExportRows: async () => [],
    deleteUser: async () => undefined,
    ...overrides,
  };
}
