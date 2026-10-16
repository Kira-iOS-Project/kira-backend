/**
 * The scheduled jobs' data access (AGENTS.md Rules 4 and 10): the per-job lock that keeps two
 * processes (an old and a new container during a deploy) from running the same job at once, and
 * the housekeeping job's sign-in codes and recorded code checks past any use.
 */

import { lt } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { client as pool, db } from '../../db/client/index.ts';
import { authCodes, signInAttempts } from '../../db/schema/schema.ts';

/** One pooled connection held apart from the pool: what postgres.js's `reserve()` hands out. */
type ReservedConnection = {
  unsafe(query: string, parameters: string[]): Promise<readonly Record<string, unknown>[]>;
  release(): void;
};

/** The part of the postgres.js client the lock uses. */
export type LockClient = { reserve(): Promise<ReservedConnection> };

type JobLockOutcome<T> = { ran: true; result: T } | { ran: false };

export type JobsRepository = {
  /**
   * Runs `run` while holding the advisory lock named `key`, or not at all when another process
   * holds it. The lock is the session's, on a reserved connection, rather than a transaction's:
   * a job sends email and opens transactions of its own, which no open transaction may wait on
   * (Rule 35). It is released when `run` settles, and by Postgres if the process dies.
   */
  withJobLock<T>(key: string, run: () => Promise<T>): Promise<JobLockOutcome<T>>;
  /** Deletes the codes created before `before`; returns how many. */
  deleteAuthCodesCreatedBefore(before: Date): Promise<number>;
  /** Deletes the recorded code checks created before `before`; returns how many. */
  deleteSignInChecksCreatedBefore(before: Date): Promise<number>;
};

/** Lock keys live in their own namespace, hashed to the bigint Postgres's advisory locks take. */
const LOCK_KEY = "hashtextextended('kira-job:' || $1, 0)";

export function createJobsRepository(
  client: PostgresJsDatabase = db,
  lockClient: LockClient = pool,
): JobsRepository {
  return {
    async withJobLock(key, run) {
      const connection = await lockClient.reserve();
      try {
        const [row] = await connection.unsafe(
          `select pg_try_advisory_lock(${LOCK_KEY}) as locked`,
          [key],
        );
        if (row?.locked !== true) return { ran: false };
        try {
          return { ran: true, result: await run() };
        } finally {
          await connection.unsafe(`select pg_advisory_unlock(${LOCK_KEY})`, [key]);
        }
      } finally {
        connection.release();
      }
    },

    async deleteAuthCodesCreatedBefore(before) {
      const rows = await client
        .delete(authCodes)
        .where(lt(authCodes.createdAt, before))
        .returning({ id: authCodes.id });
      return rows.length;
    },

    async deleteSignInChecksCreatedBefore(before) {
      const rows = await client
        .delete(signInAttempts)
        .where(lt(signInAttempts.createdAt, before))
        .returning({ id: signInAttempts.id });
      return rows.length;
    },
  };
}

export const jobsRepository = createJobsRepository();
