import { describe, expect, test } from 'bun:test';
import { SUBSCRIPTION_SOURCE } from '../../../lib/constants/plans.ts';
import { APPLICATION_STATUS, SCHOLARSHIP_SITUATION } from '../../../lib/constants/scholarship.ts';
import { createFakeDb, inOrder } from '../../../test/fake-postgres.ts';
import { createScholarshipJobsRepository } from '../scholarship-jobs.repository.ts';
import { createScholarshipRepository } from '../scholarship.repository.ts';
import { NOW, USER_ID } from './helpers.ts';

const END = new Date('2027-01-16T05:10:00.000Z');

const stored = {
  id: 'app-1',
  status: APPLICATION_STATUS.inReview,
  situations: [SCHOLARSHIP_SITUATION.chasedByLender],
  story: null,
  submittedAt: NOW.toISOString(),
  decidedAt: null,
};

describe('createScholarshipRepository', () => {
  test('reads the active plan’s source, or null', async () => {
    const fake = createFakeDb(inOrder([{ source: SUBSCRIPTION_SOURCE.purchase }], []));
    const repository = createScholarshipRepository(fake.db);

    expect(await repository.findActiveSubscriptionSource(USER_ID)).toBe(
      SUBSCRIPTION_SOURCE.purchase,
    );
    expect(await repository.findActiveSubscriptionSource(USER_ID)).toBeNull();
  });

  test('finds the latest application that was not withdrawn, with its grant', async () => {
    const fake = createFakeDb(
      inOrder([{ ...stored, grantStart: NOW.toISOString(), grantEnd: END.toISOString() }], []),
    );
    const repository = createScholarshipRepository(fake.db);

    expect(await repository.findCurrentApplication(USER_ID)).toMatchObject({
      id: 'app-1',
      submittedAt: NOW,
      grantStart: NOW,
      grantEnd: END,
    });
    expect(await repository.findCurrentApplication(USER_ID)).toBeNull();
    expect(fake.queries[0]?.sql).toContain('left join "subscriptions"');
    expect(fake.queries[0]?.sql).toContain('"scholarship_applications"."status" <> $2');
  });

  test('counts gifted months and accepted applications since a moment', async () => {
    const fake = createFakeDb(inOrder([{ months: 9 }], [{ count: 2 }], [], []));
    const repository = createScholarshipRepository(fake.db);

    expect(await repository.countQuota(NOW)).toEqual({ giftedMonths: 9, accepted: 2 });
    expect(await repository.countQuota(NOW)).toEqual({ giftedMonths: 0, accepted: 0 });
    expect(fake.queries[0]?.sql).toContain('from "gifts"');
  });

  test('tells whether Mode Darurat Utang was used', async () => {
    const fake = createFakeDb(inOrder([{ id: USER_ID }], []));
    const repository = createScholarshipRepository(fake.db);

    expect(await repository.hasUsedDebtEmergencyMode(USER_ID)).toBe(true);
    expect(await repository.hasUsedDebtEmergencyMode(USER_ID)).toBe(false);
  });

  test('stores an application, and throws when nothing comes back', async () => {
    const fake = createFakeDb(inOrder([stored], []));
    const repository = createScholarshipRepository(fake.db);
    const input = {
      userId: USER_ID,
      situations: [SCHOLARSHIP_SITUATION.chasedByLender],
      story: null,
      usedDebtEmergencyMode: false,
      status: APPLICATION_STATUS.inReview,
    };

    expect(await repository.createApplication(input)).toMatchObject({
      id: 'app-1',
      grantStart: null,
      grantEnd: null,
    });
    await expect(repository.createApplication(input)).rejects.toThrow(
      'The application was not stored',
    );
  });

  test('withdraws only an open application', async () => {
    const fake = createFakeDb(inOrder([{ id: 'app-1' }], []));
    const repository = createScholarshipRepository(fake.db);

    expect(await repository.withdrawOpenApplication(USER_ID)).toBe(true);
    expect(await repository.withdrawOpenApplication(USER_ID)).toBe(false);
    expect(fake.queries[0]?.sql).toContain('"scholarship_applications"."status" in ($');
  });
});

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

  test('grants Kira Plus and accepts in one transaction, skipping an empty list', async () => {
    const fake = createFakeDb();
    const repository = createScholarshipJobsRepository(fake.db);

    await repository.accept([], NOW, END);
    await repository.accept([{ id: 'app-1', userId: USER_ID }], NOW, END);

    expect(fake.queries).toHaveLength(2);
    expect(fake.queries[0]?.sql).toStartWith('insert into "subscriptions"');
    expect(fake.queries[1]?.sql).toContain('"subscription_id" = (select "subscriptions"."id"');
  });

  test('sets statuses and marks result emails, skipping empty lists', async () => {
    const fake = createFakeDb();
    const repository = createScholarshipJobsRepository(fake.db);

    await repository.setStatus([], APPLICATION_STATUS.waitlisted);
    await repository.setStatus(['app-1'], APPLICATION_STATUS.waitlisted);
    await repository.markResultEmailsSent([], NOW);
    await repository.markResultEmailsSent(['app-1'], NOW);

    expect(fake.queries).toHaveLength(2);
    expect(fake.queries[0]?.params[0]).toBe(APPLICATION_STATUS.waitlisted);
    expect(fake.queries[1]?.sql).toContain('"result_email_sent_at" = $1');
  });
});
