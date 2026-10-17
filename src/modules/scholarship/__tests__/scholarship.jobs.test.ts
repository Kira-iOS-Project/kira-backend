import { describe, expect, test } from 'bun:test';
import { APPLICATION_STATUS } from '../../../lib/constants/scholarship.ts';
import { emailControl, resetExternalMocks } from '../../../test/preload.ts';
import type { ReviewableApplication, UnsentResult } from '../scholarship-jobs.repository.ts';
import { scholarshipAcceptedEmail } from '../scholarship.email.ts';
import { reviewScholarshipApplications } from '../scholarship.jobs.ts';
import {
  createScholarshipJobsRepositoryMock,
  createScholarshipRepositoryMock,
  NOW,
} from './helpers.ts';

function candidate(id: string, overrides: Partial<ReviewableApplication> = {}) {
  return {
    id,
    userId: `user-${id}`,
    status: APPLICATION_STATUS.inReview,
    email: `${id}@email.com`,
    displayName: 'Dinda',
    hasActivePlan: false,
    ...overrides,
  };
}

function unsent(id: string): UnsentResult {
  return {
    id,
    email: `${id}@email.com`,
    displayName: 'Dinda',
    grantStart: NOW,
    grantEnd: new Date('2027-01-16T05:10:00.000Z'),
  };
}

describe('reviewScholarshipApplications', () => {
  test('accepts while places last, waitlists the rest, withdraws those now on a plan', async () => {
    const calls: unknown[][] = [];
    const before: Date[] = [];
    const jobsRepository = createScholarshipJobsRepositoryMock({
      findReviewable: async (cutoff) => {
        before.push(cutoff);
        return [
          candidate('a', { hasActivePlan: true }),
          candidate('b'),
          candidate('c', { status: APPLICATION_STATUS.waitlisted }),
          candidate('d'),
          candidate('e', { status: APPLICATION_STATUS.waitlisted }),
        ];
      },
      accept: async (application, start, end) => {
        calls.push(['accept', application.id, start, end.toISOString()]);
        return true;
      },
      setStatus: async (ids, status) => {
        calls.push(['status', ids, status]);
      },
      findUnsentResults: async (limit) => {
        calls.push(['unsent', limit]);
        return [unsent('b'), unsent('c')];
      },
      markResultEmailsSent: async (ids) => {
        calls.push(['emailed', ids]);
      },
    });
    const repository = createScholarshipRepositoryMock({
      countQuota: async () => ({ giftedMonths: 6, accepted: 0 }),
    });
    const sent: string[] = [];
    const send = async (message: { to: string; subject: string; text: string }) => {
      if (message.to.startsWith('c')) throw new Error('refused');
      sent.push(`${message.to} ${message.subject}`);
      expect(message.text).toContain('Berlaku: 16 Oktober 2026 sampai 16 Januari 2027');
    };

    const result = await reviewScholarshipApplications(NOW, { repository, jobsRepository, send });

    expect(result).toEqual({ accepted: 2, waitlisted: 1, withdrawn: 1 });
    expect(before[0]?.toISOString()).toBe('2026-10-15T05:10:00.000Z');
    expect(calls).toEqual([
      ['status', ['a'], APPLICATION_STATUS.withdrawn],
      ['accept', 'b', NOW, '2027-01-16T05:10:00.000Z'],
      ['accept', 'c', NOW, '2027-01-16T05:10:00.000Z'],
      ['status', ['d'], APPLICATION_STATUS.waitlisted],
      ['unsent', 100],
      ['emailed', ['b']],
    ]);
    expect(sent).toEqual(['b@email.com Beasiswa Kira-mu diterima']);
  });

  test('one acceptance that fails or no longer applies holds up none of the others', async () => {
    const tried: string[] = [];
    const jobsRepository = createScholarshipJobsRepositoryMock({
      findReviewable: async () => [candidate('b'), candidate('c'), candidate('d')],
      accept: async ({ id }) => {
        tried.push(id);
        if (id === 'b') throw new Error('subscriptions_one_active_idx');
        return id === 'd';
      },
    });
    const repository = createScholarshipRepositoryMock({
      countQuota: async () => ({ giftedMonths: 9, accepted: 0 }),
    });

    const result = await reviewScholarshipApplications(NOW, { repository, jobsRepository });

    expect(tried).toEqual(['b', 'c', 'd']);
    expect(result).toEqual({ accepted: 1, waitlisted: 0, withdrawn: 0 });
  });

  test('retries an earlier run’s failed result email, with nothing new to decide', async () => {
    const emailed: string[][] = [];
    const jobsRepository = createScholarshipJobsRepositoryMock({
      findUnsentResults: async () => [unsent('old')],
      markResultEmailsSent: async (ids) => {
        emailed.push(ids);
      },
    });
    const sent: string[] = [];
    const send = async (message: { to: string }) => {
      sent.push(message.to);
    };

    const result = await reviewScholarshipApplications(NOW, {
      repository: createScholarshipRepositoryMock(),
      jobsRepository,
      send,
    });

    expect(result).toEqual({ accepted: 0, waitlisted: 0, withdrawn: 0 });
    expect(sent).toEqual(['old@email.com']);
    expect(emailed).toEqual([['old']]);
  });

  test('sends through Resend and reads the real repositories by default', async () => {
    resetExternalMocks();
    const jobsRepository = createScholarshipJobsRepositoryMock({
      findReviewable: async () => [candidate('b')],
      findUnsentResults: async () => [unsent('b')],
    });
    const repository = createScholarshipRepositoryMock({
      countQuota: async () => ({ giftedMonths: 3, accepted: 0 }),
    });

    await reviewScholarshipApplications(NOW, { repository, jobsRepository });
    await reviewScholarshipApplications(NOW);

    expect(emailControl.sent).toHaveLength(1);
  });
});

describe('scholarshipAcceptedEmail', () => {
  const email = scholarshipAcceptedEmail({
    to: 'dinda@email.com',
    name: 'Dinda',
    grantStart: '2026-10-19',
    grantEnd: '2027-01-19',
    extensionFrom: '2027-01-05',
  });

  test('gives the grant’s dates, the extension window and the price of nothing', () => {
    expect(email.subject).toBe('Beasiswa Kira-mu diterima');
    expect(email.text).toContain('Berlaku: 19 Oktober 2026 sampai 19 Januari 2027');
    expect(email.text).toContain('ajukan lagi mulai 5 Januari 2027');
    expect(email.text).toContain('Biaya: Rp0,00');
    expect(email.html).toContain('/email/header-scholarship.png');
  });
});
