/**
 * The auth module's data access (AGENTS.md Rules 4 and 10): one-time codes, accounts and
 * sessions. Every query and every transaction boundary of signing in lives here.
 */

import { and, desc, eq, gt, gte, isNull, sql } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { db } from '../../db/client/index.ts';
import { authCodes, sessions, users } from '../../db/schema/schema.ts';

export type ActiveCode = { id: string; codeHash: string; attempts: number; expiresAt: Date };

/** What a session row stores of its two tokens: their hashes and when each stops working. */
export type SessionSecrets = {
  accessTokenHash: string;
  accessExpiresAt: Date;
  refreshTokenHash: string;
  refreshExpiresAt: Date;
};

export type RefreshableSession = {
  sessionId: string;
  userId: string;
  refreshExpiresAt: Date;
  revokedAt: Date | null;
};

export type AuthRepository = {
  countCodesForEmailSince(email: string, since: Date): Promise<number>;
  countCodesFromIpSince(ip: string, since: Date): Promise<number>;
  latestCodeAt(email: string): Promise<Date | null>;
  /** Retires every unused code of the address and stores the new one: one active code each. */
  replaceCode(input: {
    email: string;
    codeHash: string;
    requestIp: string;
    expiresAt: Date;
    now: Date;
  }): Promise<void>;
  findActiveCode(email: string): Promise<ActiveCode | null>;
  /** Counts a wrong try and returns how many the code has had. */
  recordFailedAttempt(codeId: string): Promise<number>;
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
  rotateSession(
    sessionId: string,
    secrets: SessionSecrets,
    previousRefreshTokenHash: string,
  ): Promise<void>;
  revokeSession(sessionId: string, now: Date): Promise<void>;
};

export function createAuthRepository(client: PostgresJsDatabase = db): AuthRepository {
  async function countCodes(where: ReturnType<typeof and>): Promise<number> {
    const [row] = await client
      .select({ count: sql<number>`count(*)::int` })
      .from(authCodes)
      .where(where);
    return row?.count ?? 0;
  }

  return {
    countCodesForEmailSince: (email, since) =>
      countCodes(and(eq(authCodes.email, email), gte(authCodes.createdAt, since))),

    countCodesFromIpSince: (ip, since) =>
      countCodes(and(eq(authCodes.requestIp, ip), gte(authCodes.createdAt, since))),

    async latestCodeAt(email) {
      const [row] = await client
        .select({ createdAt: authCodes.createdAt })
        .from(authCodes)
        .where(eq(authCodes.email, email))
        .orderBy(desc(authCodes.createdAt))
        .limit(1);
      return row?.createdAt ?? null;
    },

    async replaceCode({ email, codeHash, requestIp, expiresAt, now }) {
      await client.transaction(async (tx) => {
        await tx
          .update(authCodes)
          .set({ consumedAt: now })
          .where(and(eq(authCodes.email, email), isNull(authCodes.consumedAt)));
        await tx.insert(authCodes).values({ email, codeHash, requestIp, expiresAt });
      });
    },

    async findActiveCode(email) {
      const [row] = await client
        .select({
          id: authCodes.id,
          codeHash: authCodes.codeHash,
          attempts: authCodes.attempts,
          expiresAt: authCodes.expiresAt,
        })
        .from(authCodes)
        .where(and(eq(authCodes.email, email), isNull(authCodes.consumedAt)))
        .orderBy(desc(authCodes.createdAt))
        .limit(1);
      return row ?? null;
    },

    async recordFailedAttempt(codeId) {
      const [row] = await client
        .update(authCodes)
        .set({ attempts: sql`${authCodes.attempts} + 1` })
        .where(eq(authCodes.id, codeId))
        .returning({ attempts: authCodes.attempts });
      return row?.attempts ?? 0;
    },

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
      await client
        .update(sessions)
        .set({ ...secrets, previousRefreshTokenHash })
        .where(eq(sessions.id, sessionId));
    },

    async revokeSession(sessionId, now) {
      await client.update(sessions).set({ revokedAt: now }).where(eq(sessions.id, sessionId));
    },
  };
}

export const authRepository = createAuthRepository();
