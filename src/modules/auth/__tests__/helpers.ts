/**
 * Mock builders for the auth module's injected dependencies (AGENTS.md Rule 19). The default
 * repository allows every request and check, as an empty database would.
 */

import type { AuthRepository } from '../auth.repository.ts';

export function createAuthRepositoryMock(overrides: Partial<AuthRepository> = {}): AuthRepository {
  return {
    issueCode: async (_input, decide) => decide({ latestAt: null, emailCount: 0, ipCount: 0 }),
    recordCheck: async (_input, decide) => decide({ emailCount: 0, ipCount: 0 }),
    findActiveCode: async () => null,
    claimAttempt: async () => null,
    completeSignIn: async () => ({ userId: 'user-1', needsOnboarding: true }),
    findSessionByAccessToken: async () => null,
    findSessionByRefreshToken: async () => null,
    findSessionByPreviousRefreshToken: async () => null,
    rotateSession: async () => true,
    revokeSession: async () => undefined,
    ...overrides,
  };
}

export const NOW = new Date('2026-10-15T05:41:00.000Z');
