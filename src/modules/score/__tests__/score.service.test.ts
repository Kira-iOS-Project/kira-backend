import { describe, expect, test } from 'bun:test';
import { DEBT_KIND, FOCUS, MARITAL_STATUS } from '../../../lib/constants/profile.ts';
import { INDICATOR, SCORE_BAND, SNAPSHOT_REASON, STEP_KIND } from '../../../lib/constants/score.ts';
import type { NewSnapshot } from '../score.repository.ts';
import type { HealthCheckBody } from '../score.schema.ts';
import {
  estimateScoreChange,
  findScoreReport,
  getIndicatorDetail,
  getScoreReport,
  saveHealthCheck,
} from '../score.service.ts';
import { createScoreRepositoryMock, debt, NOW } from './helpers.ts';

const clock = () => NOW;

describe('getScoreReport', () => {
  test("reports Dinda's score for the period, the next payday and the steps", async () => {
    const report = await getScoreReport('user-1', {
      repository: createScoreRepositoryMock(),
      now: clock,
    });

    expect(report).toMatchObject({
      score: 66,
      band: SCORE_BAND.coping,
      delta: null,
      isInitial: true,
      computedAt: NOW.toISOString(),
      nextCheckOn: '2026-10-25',
      cappedByConsumerDebt: false,
    });
    expect(report.indicators).toHaveLength(6);
    expect(report.steps.map((step) => step.kind)).toEqual([
      STEP_KIND.payOffDebt,
      STEP_KIND.buildEmergencyFund,
      STEP_KIND.raiseSavings,
    ]);
  });

  test('takes a snapshot on the first read of a payday period and compares with the last one', async () => {
    const taken: NewSnapshot[] = [];
    let periodStart: Date | undefined;
    const report = await getScoreReport('user-1', {
      repository: createScoreRepositoryMock({
        snapshotHistory: async (_userId, start) => {
          periodStart = start;
          return { count: 1, latestInPeriodAt: null, previousScore: 62 };
        },
        insertSnapshot: async (_userId, snapshot) => void taken.push(snapshot),
      }),
      now: clock,
    });

    expect(periodStart).toEqual(new Date('2026-09-24T17:00:00.000Z'));
    expect(taken).toEqual([
      expect.objectContaining({
        score: 66,
        reason: SNAPSHOT_REASON.recompute,
        periodStart: '2026-09-25',
      }),
    ]);
    expect(report).toMatchObject({ delta: 4, isInitial: false, computedAt: NOW.toISOString() });
  });

  test('dates a fresh snapshot now', async () => {
    const report = await findScoreReport('user-1', {
      repository: createScoreRepositoryMock({
        snapshotHistory: async () => ({ count: 0, latestInPeriodAt: null, previousScore: null }),
      }),
      now: clock,
    });
    expect(report).toMatchObject({ isInitial: true, computedAt: NOW.toISOString() });
  });

  test('refuses before the health check with SCORE_NOT_AVAILABLE', async () => {
    const repository = createScoreRepositoryMock({
      findState: async () => ({
        focus: FOCUS.trackSpending,
        payday: { day: null, endOfMonth: false },
        input: null,
      }),
    });

    await expect(getScoreReport('user-1', { repository })).rejects.toMatchObject({
      statusCode: 404,
      code: 'SCORE_NOT_AVAILABLE',
    });
    expect(
      await findScoreReport('user-1', {
        repository: createScoreRepositoryMock({ findState: async () => null }),
      }),
    ).toBeNull();
  });
});

describe('getIndicatorDetail', () => {
  test('joins the indicator to its ladder', async () => {
    const detail = await getIndicatorDetail('user-1', INDICATOR.emergencyFund, {
      repository: createScoreRepositoryMock(),
      now: clock,
    });

    expect(detail).toMatchObject({ key: INDICATOR.emergencyFund, points: 50 });
    expect(detail.nextRung).toMatchObject({ points: 75, scoreTo: 70 });
  });

  test('refuses before the health check', async () => {
    const repository = createScoreRepositoryMock({ findState: async () => null });
    await expect(
      getIndicatorDetail('user-1', INDICATOR.protection, { repository }),
    ).rejects.toMatchObject({ code: 'SCORE_NOT_AVAILABLE' });
  });
});

describe('saveHealthCheck', () => {
  const body: HealthCheckBody = {
    netMonthlyIncome: 7_500_000,
    payday: { day: 25, endOfMonth: false },
    essentialMonthlyExpenses: 4_200_000,
    debts: [
      {
        kind: DEBT_KIND.paylater,
        name: 'Paylater A',
        remaining: 420_000,
        monthlyInstalment: 210_000,
        remainingTenorMonths: 2,
        annualInterestRate: null,
        dueDay: null,
      },
    ],
    emergencyFund: 3_360_000,
    monthlySavings: 600_000,
    otherAssets: null,
    propertyAssets: null,
    dependents: 0,
    maritalStatus: MARITAL_STATUS.single,
    protections: [],
  };

  test('stores the answers with their snapshot and returns the score on file', async () => {
    const saved: unknown[] = [];
    const report = await saveHealthCheck('user-1', body, {
      repository: createScoreRepositoryMock({
        saveHealthCheck: async (...args) => void saved.push(args),
      }),
      now: clock,
    });

    expect(saved).toEqual([
      [
        'user-1',
        body,
        expect.objectContaining({ reason: SNAPSHOT_REASON.healthCheck, score: 58 }),
        NOW,
      ],
    ]);
    expect(report.score).toBe(66);
  });

  test('uses the real clock by default', async () => {
    const report = await saveHealthCheck('user-1', body, {
      repository: createScoreRepositoryMock(),
    });
    expect(report.score).toBe(66);
  });
});

describe('estimateScoreChange', () => {
  const paylaterA = debt();
  const paylaterB = debt({ name: 'Paylater B', remaining: 890_000, monthlyInstalment: 290_000 });
  const motor = debt({ kind: DEBT_KIND.vehicle, name: 'Cicilan Motor', remaining: 13_000_000 });

  test('is the score with the account gone, less the score with it still open', async () => {
    const estimate = await estimateScoreChange('user-1', paylaterB, {
      repository: createScoreRepositoryMock({ listOpenDebts: async () => [paylaterA, motor] }),
    });

    expect(estimate).toMatchObject({ consumerDebtBefore: 50, consumerDebtAfter: 75 });
    expect(estimate?.after).toBeGreaterThan(estimate?.before ?? 100);
  });

  test('is null before the health check', async () => {
    const repository = createScoreRepositoryMock({
      findState: async () => ({
        focus: FOCUS.trackSpending,
        payday: { day: 25, endOfMonth: false },
        input: null,
      }),
    });
    expect(await estimateScoreChange('user-1', paylaterA, { repository })).toBeNull();
  });
});
