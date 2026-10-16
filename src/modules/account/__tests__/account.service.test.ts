import { describe, expect, test } from 'bun:test';
import { CONSENT_PURPOSE } from '../../../lib/constants/consents.ts';
import { EXPENSE_CATEGORY } from '../../../lib/constants/money.ts';
import {
  PLAN,
  PLAN_TERMS,
  SUBSCRIPTION_SOURCE,
  SUBSCRIPTION_STATUS,
} from '../../../lib/constants/plans.ts';
import { FOCUS } from '../../../lib/constants/profile.ts';
import type { ProfileChanges } from '../account.repository.ts';
import { getMe, updateMe } from '../account.service.ts';
import { createAccountRepositoryMock, createProfile, NOW, USER_ID } from './helpers.ts';

const now = () => NOW;
describe('getMe', () => {
  test('a new account: Kira Gratis, nothing used, the calendar month, every consent off', async () => {
    const periods: string[] = [];
    const repository = createAccountRepositoryMock({
      findUsage: async (_userId, periodStart) => {
        periods.push(periodStart);
        return null;
      },
    });

    const me = await getMe(USER_ID, { repository, now });

    expect(periods).toEqual(['2026-10-01']);
    expect(me).toEqual({
      id: USER_ID,
      email: 'dinda@email.com',
      displayName: 'Dinda',
      focus: FOCUS.trackSpending,
      payday: { day: null, endOfMonth: false },
      hideBalances: false,
      consented: false,
      healthCheckCompleted: false,
      plan: { id: PLAN.free, source: null, renewsOn: null },
      usage: {
        aiMessages: { used: 0, limit: PLAN_TERMS.free.aiMessages },
        receipts: { used: 0, limit: PLAN_TERMS.free.receipts },
        voiceSeconds: { used: 0, limit: 0 },
        resetsOn: '2026-11-01',
      },
      period: {
        start: '2026-10-01',
        end: '2026-10-31',
        nextPayday: '2026-11-01',
        daysUntilPayday: 16,
      },
      lastCategories: { expense: null, income: null },
      debtAccountCount: 0,
      aiEnabled: false,
      weeklySummaryEnabled: false,
      debtEmergencyActive: false,
    });
  });

  test('a Plus subscriber with a payday, counters, consents and records', async () => {
    const repository = createAccountRepositoryMock({
      findProfile: async () =>
        createProfile({ paydayDay: 25, consentedAt: NOW, focus: FOCUS.debtFree }),
      findActiveSubscriptions: async () => [
        {
          plan: PLAN.plus,
          source: SUBSCRIPTION_SOURCE.scholarship,
          status: SUBSCRIPTION_STATUS.active,
          currentPeriodStart: new Date('2026-10-01T17:00:00.000Z'),
          currentPeriodEnd: new Date('2027-01-01T17:00:00.000Z'),
        },
      ],
      findUsage: async () => ({ aiMessages: 12, receipts: 3, voiceSeconds: 90 }),
      latestConsents: async () => [
        { purpose: CONSENT_PURPOSE.aiProcessing, granted: true, decidedAt: NOW },
        { purpose: CONSENT_PURPOSE.weeklySummary, granted: false, decidedAt: NOW },
      ],
      hasHealthCheck: async () => true,
      /** An income row holding an expense category is not an income category, so it reads null. */
      lastCategory: async () => EXPENSE_CATEGORY.coffee,
      countOpenDebts: async () => 2,
    });

    const me = await getMe(USER_ID, { repository, now });

    expect(me.plan).toEqual({
      id: PLAN.plus,
      source: SUBSCRIPTION_SOURCE.scholarship,
      renewsOn: '2027-01-02',
    });
    expect(me.usage.aiMessages).toEqual({ used: 12, limit: PLAN_TERMS.plus.aiMessages });
    expect(me.usage.voiceSeconds).toEqual({ used: 90, limit: PLAN_TERMS.plus.voiceSeconds });
    expect(me.usage.resetsOn).toBe('2026-11-02');
    expect(me.period.start).toBe('2026-09-25');
    expect(me.lastCategories).toEqual({ expense: EXPENSE_CATEGORY.coffee, income: null });
    expect(me).toMatchObject({
      consented: true,
      healthCheckCompleted: true,
      debtAccountCount: 2,
      aiEnabled: true,
      weeklySummaryEnabled: false,
      focus: FOCUS.debtFree,
    });
  });

  test('says Mode Darurat Utang is active once it has been opened', async () => {
    const repository = createAccountRepositoryMock({
      findProfile: async () => createProfile({ debtEmergencyModeUsedAt: NOW }),
    });

    expect((await getMe(USER_ID, { repository, now: () => NOW })).debtEmergencyActive).toBe(true);
  });

  test('fails loudly when the session has no account', async () => {
    const repository = createAccountRepositoryMock({ findProfile: async () => null });

    expect(getMe(USER_ID, { repository, now })).rejects.toThrow('The session has no account');
  });
});

describe('updateMe', () => {
  test('stores only the fields sent, the payday as its two columns', async () => {
    const changes: ProfileChanges[] = [];
    const repository = createAccountRepositoryMock({
      updateProfile: async (_userId, change) => {
        changes.push(change);
      },
    });

    await updateMe(
      USER_ID,
      { focus: FOCUS.debtFree, hideBalances: true, payday: { day: null, endOfMonth: true } },
      { repository, now },
    );
    await updateMe(USER_ID, {}, { repository, now });
    const me = await updateMe(USER_ID, {}, { repository: createAccountRepositoryMock(), now });

    expect(changes).toEqual([
      { focus: FOCUS.debtFree, hideBalances: true, paydayDay: null, paydayEndOfMonth: true },
      {},
    ]);
    expect(me.id).toBe(USER_ID);
  });
});
