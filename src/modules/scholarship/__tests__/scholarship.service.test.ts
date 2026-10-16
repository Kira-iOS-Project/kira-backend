import { describe, expect, test } from 'bun:test';
import { SUBSCRIPTION_SOURCE } from '../../../lib/constants/plans.ts';
import {
  APPLICATION_STATUS,
  INELIGIBLE_REASON,
  SCHOLARSHIP_SITUATION,
} from '../../../lib/constants/scholarship.ts';
import {
  ScholarshipApplicationNotFoundError,
  ScholarshipNotEligibleError,
} from '../scholarship.errors.ts';
import {
  addWorkingDays,
  apply,
  getScholarship,
  toApplication,
  withdraw,
} from '../scholarship.service.ts';
import { applicationRow, createScholarshipRepositoryMock, NOW, USER_ID } from './helpers.ts';

const now = () => NOW;

describe('addWorkingDays', () => {
  test('skips the weekend', () => {
    /** Friday → Wednesday; Monday → Thursday. */
    expect(addWorkingDays('2026-10-16', 3)).toBe('2026-10-21');
    expect(addWorkingDays('2026-10-19', 3)).toBe('2026-10-22');
  });
});

describe('toApplication', () => {
  test('dates an accepted grant and its extension window in WIB', () => {
    const result = toApplication(
      applicationRow({
        status: APPLICATION_STATUS.accepted,
        decidedAt: new Date('2026-10-19T05:00:00.000Z'),
        grantStart: new Date('2026-10-19T05:00:00.000Z'),
        grantEnd: new Date('2027-01-19T05:00:00.000Z'),
      }),
    );

    expect(result).toMatchObject({
      submittedAt: NOW.toISOString(),
      decideBy: '2026-10-21',
      decidedAt: '2026-10-19T05:00:00.000Z',
      grantStart: '2026-10-19',
      grantEnd: '2027-01-19',
      extensionFrom: '2027-01-05',
    });
  });
});

describe('getScholarship', () => {
  test('is open with a quota of one place per three gifted months', async () => {
    const sinces: Date[] = [];
    const repository = createScholarshipRepositoryMock({
      countQuota: async (since) => {
        sinces.push(since);
        return { giftedMonths: 181, accepted: 18 };
      },
    });

    const result = await getScholarship(USER_ID, { repository, now });

    expect(result).toEqual({
      eligible: true,
      ineligibleReason: null,
      quota: { remaining: 42, total: 60 },
      application: null,
    });
    /** 1 October 2026, 00.00 WIB. */
    expect(sinces[0]?.toISOString()).toBe('2026-09-30T17:00:00.000Z');
  });

  test('names why it is closed', async () => {
    const reasonFor = async (
      source: (typeof SUBSCRIPTION_SOURCE)[keyof typeof SUBSCRIPTION_SOURCE] | null,
      status: (typeof APPLICATION_STATUS)[keyof typeof APPLICATION_STATUS],
    ) => {
      const repository = createScholarshipRepositoryMock({
        findActiveSubscriptionSource: async () => source,
        findCurrentApplication: async () => applicationRow({ status }),
        countQuota: async () => ({ giftedMonths: 3, accepted: 5 }),
      });
      return getScholarship(USER_ID, { repository });
    };

    const paid = await reasonFor(SUBSCRIPTION_SOURCE.purchase, APPLICATION_STATUS.inReview);
    const granted = await reasonFor(SUBSCRIPTION_SOURCE.scholarship, APPLICATION_STATUS.accepted);
    const open = await reasonFor(null, APPLICATION_STATUS.waitlisted);
    const done = await reasonFor(null, APPLICATION_STATUS.accepted);

    expect(paid.ineligibleReason).toBe(INELIGIBLE_REASON.hasPaidPlan);
    expect(granted.ineligibleReason).toBe(INELIGIBLE_REASON.hasScholarship);
    expect(open.ineligibleReason).toBe(INELIGIBLE_REASON.hasOpenApplication);
    expect(open.quota).toEqual({ remaining: 0, total: 1 });
    expect(done.eligible).toBe(true);
    expect(done.application?.status).toBe(APPLICATION_STATUS.accepted);
  });

  test('is closed until Mode Darurat Utang has been opened', async () => {
    const repository = createScholarshipRepositoryMock({
      hasUsedDebtEmergencyMode: async () => false,
    });

    const state = await getScholarship(USER_ID, { repository, now });

    expect(state.eligible).toBe(false);
    expect(state.ineligibleReason).toBe(INELIGIBLE_REASON.debtEmergencyNotUsed);
  });
});

describe('apply', () => {
  test('goes in review while places remain, with unique situations and a trimmed story', async () => {
    const stored: unknown[] = [];
    const repository = createScholarshipRepositoryMock({
      countQuota: async () => ({ giftedMonths: 3, accepted: 0 }),
      hasUsedDebtEmergencyMode: async () => true,
      createApplication: async (input) => {
        stored.push(input);
        return applicationRow({ status: input.status, story: input.story });
      },
    });
    const situations = [
      SCHOLARSHIP_SITUATION.chasedByLender,
      SCHOLARSHIP_SITUATION.chasedByLender,
      SCHOLARSHIP_SITUATION.medicalCosts,
    ];

    const result = await apply(USER_ID, { situations, story: '  Tolong  ' }, { repository, now });

    expect(result.status).toBe(APPLICATION_STATUS.inReview);
    expect(stored[0]).toEqual({
      userId: USER_ID,
      situations: [SCHOLARSHIP_SITUATION.chasedByLender, SCHOLARSHIP_SITUATION.medicalCosts],
      story: 'Tolong',
      usedDebtEmergencyMode: true,
      status: APPLICATION_STATUS.inReview,
    });
  });

  test('waits on the list when no place remains, and stores a blank story as none', async () => {
    const stored: { story: string | null; status: string }[] = [];
    const repository = createScholarshipRepositoryMock({
      createApplication: async (input) => {
        stored.push(input);
        return applicationRow({ status: input.status });
      },
    });
    const body = { situations: [SCHOLARSHIP_SITUATION.incomeStopped] };

    await apply(USER_ID, { ...body, story: '   ' }, { repository, now });
    await apply(USER_ID, body, { repository, now });

    expect(stored.map((input) => input.story)).toEqual([null, null]);
    expect(stored[0]?.status).toBe(APPLICATION_STATUS.waitlisted);
  });

  test('refuses someone who cannot apply', async () => {
    const repository = createScholarshipRepositoryMock({
      findActiveSubscriptionSource: async () => SUBSCRIPTION_SOURCE.purchase,
    });

    await expect(
      apply(USER_ID, { situations: [SCHOLARSHIP_SITUATION.otherHardship] }, { repository, now }),
    ).rejects.toBeInstanceOf(ScholarshipNotEligibleError);
  });

  test('answers 409 when a concurrent apply won the one-open-application index', async () => {
    const repository = createScholarshipRepositoryMock({ createApplication: async () => null });

    const refused = apply(
      USER_ID,
      { situations: [SCHOLARSHIP_SITUATION.otherHardship] },
      { repository, now },
    );

    await expect(refused).rejects.toBeInstanceOf(ScholarshipNotEligibleError);
    await expect(refused).rejects.toThrow(INELIGIBLE_REASON.hasOpenApplication);
  });
});

describe('withdraw', () => {
  test('withdraws the open application, or answers 404', async () => {
    const open = createScholarshipRepositoryMock({ withdrawOpenApplication: async () => true });

    await withdraw(USER_ID, { repository: open });
    await expect(
      withdraw(USER_ID, { repository: createScholarshipRepositoryMock() }),
    ).rejects.toBeInstanceOf(ScholarshipApplicationNotFoundError);
  });
});
