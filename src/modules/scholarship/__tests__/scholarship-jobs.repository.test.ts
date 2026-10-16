import { describe, expect, test } from 'bun:test';
import { SUBSCRIPTION_SOURCE } from '../../../lib/constants/plans.ts';
import { APPLICATION_STATUS } from '../../../lib/constants/scholarship.ts';
import { createFakeDb, inOrder } from '../../../test/fake-postgres.ts';
import { createScholarshipJobsRepository } from '../scholarship-jobs.repository.ts';
import { NOW, USER_ID } from './helpers.ts';

const END = new Date('2027-01-16T05:10:00.000Z');
const OPEN_GUARD = '"scholarship_applications"."status" in ($';

describe('createScholarshipJobsRepository', () => {
  test('finds open applications old enough, oldest first, bounded', async () => {
    const row = {
      id: 'app-1',
      userId: USER_ID,
      status: APPLICATION_STATUS.inReview,
      email: 'dinda@email.com',
      displayName: 'Dinda',
      hasActivePlan: false,
    };
    const fake = createFakeDb(inOrder([row]));

    expect(await createScholarshipJobsRepository(fake.db).findReviewable(NOW, 100)).toEqual([row]);
    expect(fake.queries[0]?.sql).toContain('exists (select 1 from "subscriptions"');
    expect(fake.queries[0]?.sql).toContain(
      'order by "scholarship_applications"."submitted_at" asc',
    );
  });

  test('accepts one application in its own transaction, under the person’s lock', async () => {
    const fake = createFakeDb(inOrder([{ id: USER_ID }], [{ id: 'app-1' }], [{ id: 'sub-9' }], []));

    const accepted = await createScholarshipJobsRepository(fake.db).accept(
      { id: 'app-1', userId: USER_ID },
      NOW,
      END,
    );

    expect(accepted).toBe(true);
    expect(fake.queries.map((query) => query.sql.split(' ').slice(0, 3).join(' '))).toEqual([
      'select "id" from',
      'update "scholarship_applications" set',
      'insert into "subscriptions"',
      'update "scholarship_applications" set',
    ]);
    expect(fake.queries[0]?.sql).toEndWith('for no key update');
    expect(fake.queries[2]?.params).toContain(SUBSCRIPTION_SOURCE.scholarship);
    expect(fake.queries[3]?.params[0]).toBe('sub-9');
  });

  test('re-checks the application is still open and its person holds no plan', async () => {
    const fake = createFakeDb(inOrder([{ id: USER_ID }], []));

    const accepted = await createScholarshipJobsRepository(fake.db).accept(
      { id: 'app-1', userId: USER_ID },
      NOW,
      END,
    );

    /** Withdrawn meanwhile, or a plan bought meanwhile: nothing granted, nothing else written. */
    expect(accepted).toBe(false);
    expect(fake.queries).toHaveLength(2);
    expect(fake.queries[1]?.sql).toContain(OPEN_GUARD);
    expect(fake.queries[1]?.sql).toContain('not exists (select "id" from "subscriptions"');
    expect(fake.queries[1]?.params).toContain(APPLICATION_STATUS.inReview);
    expect(fake.queries[1]?.params).toContain(APPLICATION_STATUS.waitlisted);
  });

  test('throws when the grant comes back empty', async () => {
    const fake = createFakeDb(inOrder([{ id: USER_ID }], [{ id: 'app-1' }], []));

    await expect(
      createScholarshipJobsRepository(fake.db).accept({ id: 'app-1', userId: USER_ID }, NOW, END),
    ).rejects.toThrow('The grant was not created');
  });

  test('moves only applications still open, skipping an empty list', async () => {
    const fake = createFakeDb();
    const repository = createScholarshipJobsRepository(fake.db);

    await repository.setStatus([], APPLICATION_STATUS.waitlisted);
    await repository.setStatus(['app-1'], APPLICATION_STATUS.waitlisted);

    expect(fake.queries).toHaveLength(1);
    expect(fake.queries[0]?.params[0]).toBe(APPLICATION_STATUS.waitlisted);
    expect(fake.queries[0]?.sql).toContain('"scholarship_applications"."id" in ($');
    expect(fake.queries[0]?.sql).toContain(OPEN_GUARD);
  });

  test('finds accepted applications still owed their email, with the grant’s dates', async () => {
    const row = {
      id: 'app-1',
      email: 'dinda@email.com',
      displayName: 'Dinda',
      grantStart: NOW.toISOString(),
      grantEnd: END.toISOString(),
    };
    const fake = createFakeDb(inOrder([row]));

    expect(await createScholarshipJobsRepository(fake.db).findUnsentResults(100)).toEqual([
      { ...row, grantStart: NOW, grantEnd: END },
    ]);
    expect(fake.queries[0]?.sql).toContain('inner join "subscriptions"');
    expect(fake.queries[0]?.sql).toContain(
      '"scholarship_applications"."result_email_sent_at" is null',
    );
    expect(fake.queries[0]?.params).toEqual([APPLICATION_STATUS.accepted, 100]);
  });

  test('marks result emails, skipping an empty list', async () => {
    const fake = createFakeDb();
    const repository = createScholarshipJobsRepository(fake.db);

    await repository.markResultEmailsSent([], NOW);
    await repository.markResultEmailsSent(['app-1'], NOW);

    expect(fake.queries).toHaveLength(1);
    expect(fake.queries[0]?.sql).toContain('"result_email_sent_at" = $1');
  });
});
