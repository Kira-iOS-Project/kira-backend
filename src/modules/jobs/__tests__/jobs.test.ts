import { describe, expect, test } from 'bun:test';
import { createFakeDb, inOrder } from '../../../test/fake-postgres.ts';
import { createJobsRepository } from '../jobs.repository.ts';
import { scheduledJobs } from '../index.ts';
import { deleteStaleAuthCodes } from '../jobs.service.ts';

const NOW = new Date('2026-10-16T05:10:00.000Z');

describe('deleteStaleAuthCodes', () => {
  test('deletes the codes created more than a day ago', async () => {
    const cutoffs: Date[] = [];
    const result = await deleteStaleAuthCodes(NOW, {
      repository: {
        deleteAuthCodesCreatedBefore: async (before) => {
          cutoffs.push(before);
          return 4;
        },
      },
    });

    expect(result).toEqual({ deleted: 4 });
    expect(cutoffs[0]?.toISOString()).toBe('2026-10-15T05:10:00.000Z');
  });

  test('uses the real repository by default', async () => {
    expect(await deleteStaleAuthCodes(NOW)).toEqual({ deleted: 0 });
  });
});

describe('createJobsRepository', () => {
  test('deletes by creation time and counts the rows', async () => {
    const fake = createFakeDb(inOrder([{ id: 'a' }, { id: 'b' }]));

    expect(await createJobsRepository(fake.db).deleteAuthCodesCreatedBefore(NOW)).toBe(2);
    expect(fake.queries[0]?.sql).toStartWith('delete from "auth_codes" where');
    expect(fake.queries[0]?.sql).toContain('"auth_codes"."created_at" < $1');
  });
});

describe('scheduledJobs', () => {
  test('rolls periods over before the reminders, then reviews and cleans up', () => {
    expect(scheduledJobs.map((job) => job.name)).toEqual([
      'subscription-rollover',
      'renewal-reminders',
      'scholarship-review',
      'auth-code-cleanup',
    ]);
  });
});
