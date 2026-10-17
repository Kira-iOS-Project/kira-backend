import { describe, expect, test } from 'bun:test';
import { createFakeDb, inOrder } from '../../../test/fake-postgres.ts';
import { dbControl, resetExternalMocks } from '../../../test/preload.ts';
import { createJobsRepository, type JobsRepository, type LockClient } from '../jobs.repository.ts';
import { scheduledJobs } from '../index.ts';
import { deleteStaleAuthCodes, exclusive } from '../jobs.service.ts';

const NOW = new Date('2026-10-16T05:10:00.000Z');

describe('deleteStaleAuthCodes', () => {
  test('deletes the codes created more than a day ago', async () => {
    const cutoffs: Date[] = [];
    const result = await deleteStaleAuthCodes(NOW, {
      repository: {
        withJobLock: async () => ({ ran: false }),
        deleteAuthCodesCreatedBefore: async (before) => {
          cutoffs.push(before);
          return 4;
        },
        deleteSignInChecksCreatedBefore: async (before) => {
          cutoffs.push(before);
          return 9;
        },
      },
    });

    expect(result).toEqual({ deleted: 4, checks: 9 });
    expect(cutoffs[1]).toEqual(cutoffs[0]);
    expect(cutoffs[0]?.toISOString()).toBe('2026-10-15T05:10:00.000Z');
  });

  test('uses the real repository by default', async () => {
    expect(await deleteStaleAuthCodes(NOW)).toEqual({ deleted: 0, checks: 0 });
  });
});

describe('createJobsRepository', () => {
  test('deletes by creation time and counts the rows', async () => {
    const fake = createFakeDb(inOrder([{ id: 'a' }, { id: 'b' }]));

    expect(await createJobsRepository(fake.db).deleteAuthCodesCreatedBefore(NOW)).toBe(2);
    expect(fake.queries[0]?.sql).toStartWith('delete from "auth_codes" where');
    expect(fake.queries[0]?.sql).toContain('"auth_codes"."created_at" < $1');
  });

  test('deletes recorded code checks by creation time', async () => {
    const fake = createFakeDb(inOrder([{ id: 'a' }]));

    expect(await createJobsRepository(fake.db).deleteSignInChecksCreatedBefore(NOW)).toBe(1);
    expect(fake.queries[0]?.sql).toStartWith('delete from "sign_in_attempts" where');
  });
});

/** A postgres.js client whose reserved connection answers the try-lock with `locked`. */
function lockClient(locked: boolean) {
  const statements: { sql: string; params: string[] }[] = [];
  const events: string[] = [];
  const client: LockClient = {
    async reserve() {
      events.push('reserve');
      return {
        async unsafe(sql, params) {
          statements.push({ sql, params });
          return sql.includes('pg_try_advisory_lock')
            ? [{ locked }]
            : [{ pg_advisory_unlock: true }];
        },
        release() {
          events.push('release');
        },
      };
    },
  };
  return { client, statements, events };
}

describe('withJobLock', () => {
  test('runs the job under its advisory lock, then unlocks and gives the connection back', async () => {
    const lock = lockClient(true);
    const repository = createJobsRepository(createFakeDb().db, lock.client);

    const outcome = await repository.withJobLock('renewal-reminders', async () => 7);

    expect(outcome).toEqual({ ran: true, result: 7 });
    expect(lock.statements).toEqual([
      {
        sql: "select pg_try_advisory_lock(hashtextextended('kira-job:' || $1, 0)) as locked",
        params: ['renewal-reminders'],
      },
      {
        sql: "select pg_advisory_unlock(hashtextextended('kira-job:' || $1, 0))",
        params: ['renewal-reminders'],
      },
    ]);
    expect(lock.events).toEqual(['reserve', 'release']);
  });

  test('skips the job when another process holds the lock', async () => {
    const lock = lockClient(false);
    const ran: string[] = [];

    const outcome = await createJobsRepository(createFakeDb().db, lock.client).withJobLock(
      'renewal-reminders',
      async () => ran.push('ran'),
    );

    expect(outcome).toEqual({ ran: false });
    expect(ran).toEqual([]);
    expect(lock.statements).toHaveLength(1);
    expect(lock.events).toEqual(['reserve', 'release']);
  });

  test('unlocks and releases when the job throws', async () => {
    const lock = lockClient(true);

    const outcome = createJobsRepository(createFakeDb().db, lock.client).withJobLock(
      'scholarship-review',
      async () => {
        throw new Error('boom');
      },
    );

    await expect(outcome).rejects.toThrow('boom');
    expect(lock.statements[1]?.sql).toContain('pg_advisory_unlock');
    expect(lock.events).toEqual(['reserve', 'release']);
  });
});

describe('exclusive', () => {
  function repositoryHolding(held: boolean, keys: string[]): JobsRepository {
    return {
      deleteAuthCodesCreatedBefore: async () => 0,
      deleteSignInChecksCreatedBefore: async () => 0,
      async withJobLock(key, run) {
        keys.push(key);
        return held ? { ran: false } : { ran: true, result: await run() };
      },
    };
  }

  test('runs the job under the lock named after it', async () => {
    const keys: string[] = [];
    const seen: Date[] = [];
    const job = exclusive(
      'subscription-rollover',
      async (now) => {
        seen.push(now);
        return { renewed: 1 };
      },
      { repository: repositoryHolding(false, keys) },
    );

    expect(await job.run(NOW)).toEqual({ renewed: 1 });
    expect(job.name).toBe('subscription-rollover');
    expect(keys).toEqual(['subscription-rollover']);
    expect(seen).toEqual([NOW]);
  });

  test('skips quietly while another process runs the same job', async () => {
    const ran: Date[] = [];
    const job = exclusive('subscription-rollover', async (now) => ran.push(now), {
      repository: repositoryHolding(true, []),
    });

    expect(await job.run(NOW)).toEqual({ skipped: 'locked' });
    expect(ran).toEqual([]);
  });

  test('takes the lock through the real pool by default', async () => {
    resetExternalMocks();
    dbControl.respond = (query) =>
      query.sql.includes('pg_try_advisory_lock') ? [{ locked: true }] : [];

    expect(await exclusive('auth-code-cleanup', async () => 'ran').run(NOW)).toBe('ran');
    expect(dbControl.queries.map((query) => query.sql.split('(')[0])).toEqual([
      'select pg_try_advisory_lock',
      'select pg_advisory_unlock',
    ]);
    resetExternalMocks();
  });
});

describe('scheduledJobs', () => {
  test('runs weekly summaries on their own exact deadline after routine jobs', () => {
    expect(scheduledJobs.map((job) => job.name)).toEqual([
      'subscription-rollover',
      'renewal-reminders',
      'scholarship-review',
      'score-monthly-snapshot',
      'auth-code-cleanup',
      'weekly-summary-thursday',
    ]);
    expect(scheduledJobs.at(-1)?.nextRunAt?.(NOW).toISOString()).toBe('2026-10-21T23:00:00.000Z');
  });
});
