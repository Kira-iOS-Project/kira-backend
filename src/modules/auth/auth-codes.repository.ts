/**
 * The sign-in codes' data access (AGENTS.md Rules 4 and 10). Every limit is decided inside the
 * transaction that writes, under advisory locks on the address and the network, so a burst of
 * parallel requests is counted one at a time (Rule 24): a code request sees the codes the requests
 * before it stored, a check sees the checks before it, and a code's tries are claimed one by one.
 */

import { and, count, desc, eq, gt, gte, isNull, lt, sql } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { authCodes, signInAttempts } from '../../db/schema/schema.ts';

type ActiveCode = { id: string; codeHash: string; attempts: number; expiresAt: Date };

/** What a code request is decided on: the latest code and the codes in the window. */
export type CodeUsage = { latestAt: Date | null; emailCount: number; ipCount: number };

/** What a code check is decided on: the checks in the window. */
export type CheckUsage = { emailCount: number; ipCount: number };

/** A refusal reason, or null to go ahead. */
type Decide<Usage> = (usage: Usage) => string | null;

type Transaction = Parameters<Parameters<PostgresJsDatabase['transaction']>[0]>[0];

export type AuthCodeQueries = {
  /** Stores the code, retiring older ones, unless `decide` refuses; returns the refusal or null. */
  issueCode(
    input: { email: string; ip: string; codeHash: string; expiresAt: Date; now: Date; since: Date },
    decide: Decide<CodeUsage>,
  ): Promise<string | null>;
  /** Records one code check unless `decide` refuses; returns the refusal or null. */
  recordCheck(
    input: { email: string; ip: string; since: Date },
    decide: Decide<CheckUsage>,
  ): Promise<string | null>;
  findActiveCode(email: string): Promise<ActiveCode | null>;
  /**
   * Takes one try of a live code, atomically: null when the code is spent, expired, used, or out of
   * tries. The caller compares only after a claim, so concurrent guesses get `maxAttempts` at most.
   */
  claimAttempt(
    codeId: string,
    now: Date,
    maxAttempts: number,
  ): Promise<{ codeHash: string; attempts: number } | null>;
};

/** Holds the address's and the network's locks until the transaction ends, always in this order. */
async function lockSignIn(tx: Transaction, email: string, ip: string): Promise<void> {
  await tx.execute(
    sql`select pg_advisory_xact_lock(hashtextextended(${`auth:email:${email}`}, 0))`,
  );
  await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`auth:ip:${ip}`}, 0))`);
}

export function createAuthCodeQueries(client: PostgresJsDatabase): AuthCodeQueries {
  return {
    issueCode({ email, ip, codeHash, expiresAt, now, since }, decide) {
      return client.transaction(async (tx) => {
        await lockSignIn(tx, email, ip);
        const counted = (where: ReturnType<typeof and>) =>
          tx.select({ count: count() }).from(authCodes).where(where);
        const [[latest], [byEmail], [byIp]] = await Promise.all([
          tx
            .select({ createdAt: authCodes.createdAt })
            .from(authCodes)
            .where(eq(authCodes.email, email))
            .orderBy(desc(authCodes.createdAt))
            .limit(1),
          counted(and(eq(authCodes.email, email), gte(authCodes.createdAt, since))),
          counted(and(eq(authCodes.requestIp, ip), gte(authCodes.createdAt, since))),
        ]);
        const refusal = decide({
          latestAt: latest?.createdAt ?? null,
          emailCount: byEmail?.count ?? 0,
          ipCount: byIp?.count ?? 0,
        });
        if (refusal !== null) return refusal;
        await tx
          .update(authCodes)
          .set({ consumedAt: now })
          .where(and(eq(authCodes.email, email), isNull(authCodes.consumedAt)));
        await tx.insert(authCodes).values({ email, codeHash, requestIp: ip, expiresAt });
        return null;
      });
    },

    recordCheck({ email, ip, since }, decide) {
      return client.transaction(async (tx) => {
        await lockSignIn(tx, email, ip);
        const counted = (where: ReturnType<typeof and>) =>
          tx.select({ count: count() }).from(signInAttempts).where(where);
        const [[byEmail], [byIp]] = await Promise.all([
          counted(and(eq(signInAttempts.email, email), gte(signInAttempts.createdAt, since))),
          counted(and(eq(signInAttempts.requestIp, ip), gte(signInAttempts.createdAt, since))),
        ]);
        const refusal = decide({ emailCount: byEmail?.count ?? 0, ipCount: byIp?.count ?? 0 });
        if (refusal !== null) return refusal;
        await tx.insert(signInAttempts).values({ email, requestIp: ip });
        return null;
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

    async claimAttempt(codeId, now, maxAttempts) {
      const [row] = await client
        .update(authCodes)
        .set({ attempts: sql`${authCodes.attempts} + 1` })
        .where(
          and(
            eq(authCodes.id, codeId),
            isNull(authCodes.consumedAt),
            gt(authCodes.expiresAt, now),
            lt(authCodes.attempts, maxAttempts),
          ),
        )
        .returning({ codeHash: authCodes.codeHash, attempts: authCodes.attempts });
      return row ?? null;
    },
  };
}
