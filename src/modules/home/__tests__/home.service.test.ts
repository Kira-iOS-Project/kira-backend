import { describe, expect, test } from 'bun:test';
import { HOME_VARIANT, MICRO_TARGET } from '../../../lib/constants/home.ts';
import { FOCUS } from '../../../lib/constants/profile.ts';
import { SCORE_BAND, STEP_KIND } from '../../../lib/constants/score.ts';
import { addDays } from '../../../lib/time/wib.ts';
import type { ScoreReport } from '../../score/index.ts';
import { getHome } from '../home.service.ts';
import { account, createHomeRepositoryMock, NOW } from './helpers.ts';

const REPORT: ScoreReport = {
  score: 66,
  band: SCORE_BAND.coping,
  delta: 4,
  isInitial: false,
  computedAt: NOW.toISOString(),
  nextCheckOn: '2026-10-25',
  groups: [],
  indicators: [],
  steps: [
    { kind: STEP_KIND.payOffDebt, estimatedGain: 5, debtName: 'Paylater A', remaining: 420_000 },
    { kind: STEP_KIND.addProtection, estimatedGain: 8 },
  ],
  cappedByConsumerDebt: false,
};

const deps = (overrides: Parameters<typeof createHomeRepositoryMock>[0] = {}) => ({
  repository: createHomeRepositoryMock(overrides),
  now: () => NOW,
  scoreReport: async () => REPORT,
});

describe('getHome', () => {
  test('shows the overview with money left until payday, the first step and the weekly summary', async () => {
    const home = await getHome('user-1', deps());

    expect(home).toEqual({
      variant: HOME_VARIANT.overview,
      today: '2026-10-16',
      displayName: 'Dinda',
      hideBalances: false,
      period: {
        start: '2026-09-25',
        end: '2026-10-24',
        nextPayday: '2026-10-25',
        daysUntilPayday: 9,
      },
      money: {
        income: 7_500_000,
        spent: 5_660_000,
        remaining: 1_840_000,
        perDay: 204_444,
        spentPercent: 75,
      },
      step: REPORT.steps[0] ?? null,
      stepPosition: { index: 1, total: 2 },
      score: { score: 66, band: SCORE_BAND.coping, delta: 4, isInitial: false },
      weeklySummary: { from: '2026-10-09', to: addDays('2026-10-16', -1) },
      checklist: null,
      debtPlan: null,
      microTarget: null,
    });
  });

  test("prefers the period's recorded income and never shows money below zero", async () => {
    const home = await getHome(
      'user-1',
      deps({ totalsBetween: async () => ({ income: 1_000_000, expense: 2_000_000, count: 0 }) }),
    );

    expect(home.money).toEqual({
      income: 1_000_000,
      spent: 2_000_000,
      remaining: 0,
      perDay: 0,
      spentPercent: 200,
    });
    expect(home.weeklySummary).toBeNull();
  });

  test('shows no weekly summary without the consent, and no money without any income', async () => {
    const home = await getHome(
      'user-1',
      deps({
        weeklySummaryEnabled: async () => false,
        findAccount: async () => account({ income: null }),
        totalsBetween: async () => ({ income: 0, expense: 0, count: 3 }),
      }),
    );

    expect(home.weeklySummary).toBeNull();
    expect(home.money).toMatchObject({ income: 0, spentPercent: 0 });
  });

  test('shows the first steps and their checklist before the first transaction', async () => {
    const home = await getHome(
      'user-1',
      deps({
        hasTransactions: async () => false,
        findAccount: async () => account({ payday: { day: null, endOfMonth: false } }),
      }),
    );

    expect(home).toMatchObject({
      variant: HOME_VARIANT.firstSteps,
      money: null,
      step: null,
      stepPosition: null,
      checklist: {
        healthCheck: true,
        firstTransaction: false,
        walletAdded: false,
        paydaySet: false,
      },
      score: { score: 66 },
    });
  });

  test('shows the debt plan and a one-week micro target for the debt-free focus', async () => {
    const home = await getHome(
      'user-1',
      deps({
        findAccount: async () =>
          account({ focus: FOCUS.debtFree, essential: 1_500_000, emergencyFund: 120_000 }),
      }),
    );

    expect(home).toMatchObject({
      variant: HOME_VARIANT.debtPlan,
      money: null,
      checklist: null,
      debtPlan: { paidOff: 1_600_000, total: 20_000_000, remaining: 18_400_000, percent: 8 },
      microTarget: { kind: MICRO_TARGET.oneWeek, current: 120_000, target: 350_000 },
    });
  });

  test('moves the micro target to a month once a week is saved, and drops it without an answer', async () => {
    const monthly = await getHome(
      'user-1',
      deps({
        findAccount: async () =>
          account({ focus: FOCUS.debtFree, essential: 1_500_000, emergencyFund: 400_000 }),
      }),
    );
    expect(monthly.microTarget).toEqual({
      kind: MICRO_TARGET.oneMonth,
      current: 400_000,
      target: 1_500_000,
    });

    const unanswered = await getHome(
      'user-1',
      deps({
        findAccount: async () =>
          account({ focus: FOCUS.debtFree, essential: null, emergencyFund: null }),
        debtTotals: async () => ({ original: 0, remaining: 0 }),
      }),
    );
    expect(unanswered.microTarget).toBeNull();
    expect(unanswered.debtPlan).toEqual({ paidOff: 0, total: 0, remaining: 0, percent: 0 });
  });

  test('shows no score and no step before the health check', async () => {
    const home = await getHome('user-1', { ...deps(), scoreReport: async () => null });
    expect(home).toMatchObject({ score: null, step: null, stepPosition: null });
  });

  test('answers 401 AUTH_UNAUTHENTICATED when the account was deleted mid-request', async () => {
    await expect(getHome('user-1', deps({ findAccount: async () => null }))).rejects.toMatchObject({
      statusCode: 401,
      code: 'AUTH_UNAUTHENTICATED',
    });
  });
});
