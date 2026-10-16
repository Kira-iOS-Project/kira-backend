import { describe, expect, test } from 'bun:test';
import { SUBSCRIPTION_SOURCE } from '../../../lib/constants/plans.ts';
import {
  APPLICATION_STATUS,
  OPEN_APPLICATION_INDEX,
  SCHOLARSHIP_SITUATION,
} from '../../../lib/constants/scholarship.ts';
import { createFakeDb, inOrder } from '../../../test/fake-postgres.ts';
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

const input = {
  userId: USER_ID,
  situations: [SCHOLARSHIP_SITUATION.chasedByLender],
  story: null,
  usedDebtEmergencyMode: false,
  status: APPLICATION_STATUS.inReview,
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

    expect(await repository.createApplication(input)).toMatchObject({
      id: 'app-1',
      grantStart: null,
      grantEnd: null,
    });
    await expect(repository.createApplication(input)).rejects.toThrow(
      'The application was not stored',
    );
  });

  test('answers null when the one-open-application index refuses a concurrent second', async () => {
    const duplicate = Object.assign(new Error('duplicate key value'), {
      code: '23505',
      constraint_name: OPEN_APPLICATION_INDEX,
    });
    const fake = createFakeDb(() => {
      throw duplicate;
    });

    expect(await createScholarshipRepository(fake.db).createApplication(input)).toBeNull();
  });

  test('lets any other failure through, another index’s violation included', async () => {
    const other = Object.assign(new Error('duplicate key value'), {
      code: '23505',
      constraint_name: 'scholarship_applications_pkey',
    });
    const fake = createFakeDb(inOrder());
    const repository = createScholarshipRepository(fake.db);

    fake.respondWith(() => {
      throw other;
    });
    await expect(repository.createApplication(input)).rejects.toThrow('Failed query');
    fake.respondWith(() => {
      throw new Error('connection reset');
    });
    await expect(repository.createApplication(input)).rejects.toThrow('Failed query');
  });

  test('withdraws only an open application', async () => {
    const fake = createFakeDb(inOrder([{ id: 'app-1' }], []));
    const repository = createScholarshipRepository(fake.db);

    expect(await repository.withdrawOpenApplication(USER_ID)).toBe(true);
    expect(await repository.withdrawOpenApplication(USER_ID)).toBe(false);
    expect(fake.queries[0]?.sql).toContain('"scholarship_applications"."status" in ($');
  });
});
