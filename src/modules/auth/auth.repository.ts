/**
 * The auth module's data access (AGENTS.md Rules 4 and 10): accounts and sessions here, the
 * one-time codes and their limits in auth-codes.repository.ts. Every query and every transaction
 * boundary of signing in lives in these two files.
 */

import { and, eq, gt, isNull } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { db } from '../../db/client/index.ts';
import { authCodes, sessions, users } from '../../db/schema/schema.ts';
import { type AuthCodeQueries, createAuthCodeQueries } from './auth-codes.repository.ts';

/** What a session row stores of its two tokens: their hashes and when each stops working. */
export type SessionSecrets = {
  accessTokenHash: string;
  accessExpiresAt: Date;
  refreshTokenHash: string;
  refreshExpiresAt: Date;
};

type RefreshableSession = {
  sessionId: string;
  userId: string;
  refreshExpiresAt: Date;
  revokedAt: Date | null;
};

export type AuthRepository = AuthCodeQueries & {
  /** Uses the code, creates the account on a first sign-in, and opens a session, together. */
  completeSignIn(input: {
    codeId: string;
    email: string;
    displayName: string;
    secrets: SessionSecrets;
    now: Date;
  }): Promise<{ userId: string; needsOnboarding: boolean }>;
  findSessionByAccessToken(
    hash: string,
    now: Date,
  ): Promise<{ sessionId: string; userId: string } | null>;
  findSessionByRefreshToken(hash: string): Promise<RefreshableSession | null>;
  findSessionByPreviousRefreshToken(hash: string): Promise<{ sessionId: string } | null>;
  /**
   * Replaces the session's tokens only while `previousRefreshTokenHash` is still its refresh token
   * and it is not revoked; false when another refresh got there first.
   */
  rotateSession(
    sessionId: string,
    secrets: SessionSecrets,
    previousRefreshTokenHash: string,
  ): Promise<boolean>;
  revokeSession(sessionId: string, now: Date): Promise<void>;
};

export function createAuthRepository(client: PostgresJsDatabase = db): AuthRepository {
  return {
    ...createAuthCodeQueries(client),

    completeSignIn({ codeId, email, displayName, secrets, now }) {
      return client.transaction(async (tx) => {
        await tx.update(authCodes).set({ consumedAt: now }).where(eq(authCodes.id, codeId));
        const [created] = await tx
          .insert(users)
          .values({ email, displayName })
          .onConflictDoNothing({ target: users.email })
          .returning({ id: users.id, consentedAt: users.consentedAt });
        const [account] = created
          ? [created]
          : await tx
              .select({ id: users.id, consentedAt: users.consentedAt })
              .from(users)
              .where(eq(users.email, email))
              .limit(1);
        if (!account) throw new Error('The account was neither created nor found');
        await tx.insert(sessions).values({ userId: account.id, ...secrets });
        return { userId: account.id, needsOnboarding: account.consentedAt === null };
      });
    },

    async findSessionByAccessToken(hash, now) {
      const [row] = await client
        .select({ sessionId: sessions.id, userId: sessions.userId })
        .from(sessions)
        .where(
          and(
            eq(sessions.accessTokenHash, hash),
            isNull(sessions.revokedAt),
            gt(sessions.accessExpiresAt, now),
          ),
        )
        .limit(1);
      return row ?? null;
    },

    async findSessionByRefreshToken(hash) {
      const [row] = await client
        .select({
          sessionId: sessions.id,
          userId: sessions.userId,
          refreshExpiresAt: sessions.refreshExpiresAt,
          revokedAt: sessions.revokedAt,
        })
        .from(sessions)
        .where(eq(sessions.refreshTokenHash, hash))
        .limit(1);
      return row ?? null;
    },

    async findSessionByPreviousRefreshToken(hash) {
      const [row] = await client
        .select({ sessionId: sessions.id })
        .from(sessions)
        .where(eq(sessions.previousRefreshTokenHash, hash))
        .limit(1);
      return row ?? null;
    },

    async rotateSession(sessionId, secrets, previousRefreshTokenHash) {
      const rows = await client
        .update(sessions)
        .set({ ...secrets, previousRefreshTokenHash })
        .where(
          and(
            eq(sessions.id, sessionId),
            eq(sessions.refreshTokenHash, previousRefreshTokenHash),
            isNull(sessions.revokedAt),
          ),
        )
        .returning({ id: sessions.id });
      return rows.length > 0;
    },

    async revokeSession(sessionId, now) {
      await client.update(sessions).set({ revokedAt: now }).where(eq(sessions.id, sessionId));
    },
  };
}

export const authRepository = createAuthRepository();
