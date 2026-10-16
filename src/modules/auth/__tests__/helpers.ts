/**
 * Mock builders for the auth module's injected dependencies (AGENTS.md Rule 19).
 */

import type { AuthRepository } from '../auth.repository.ts';

export function createAuthRepositoryMock(overrides: Partial<AuthRepository> = {}): AuthRepository {
  return {
    countCodesForEmailSince: async () => 0,
    countCodesFromIpSince: async () => 0,
    latestCodeAt: async () => null,
    replaceCode: async () => undefined,
    findActiveCode: async () => null,
    recordFailedAttempt: async () => 1,
    completeSignIn: async () => ({ userId: 'user-1', needsOnboarding: true }),
    findSessionByAccessToken: async () => null,
    findSessionByRefreshToken: async () => null,
    findSessionByPreviousRefreshToken: async () => null,
    rotateSession: async () => undefined,
    revokeSession: async () => undefined,
    ...overrides,
  };
}

export const NOW = new Date('2026-10-15T05:41:00.000Z');
