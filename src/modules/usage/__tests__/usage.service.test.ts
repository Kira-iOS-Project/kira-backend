import { describe, expect, test } from 'bun:test';
import { PLAN } from '../../../lib/constants/plans.ts';
import { activePlanOf } from '../../../lib/usage/plan-usage.ts';
import { currentPlanUsage, getUsage, requireVoiceAndImport } from '../usage.service.ts';
import { createSubscriptionMock, createUsageRepositoryMock, NOW } from './helpers.ts';

const clock = () => NOW;

describe('currentPlanUsage', () => {
  test('counts Kira Gratis by calendar month', async () => {
    const periods: string[] = [];
    const repository = createUsageRepositoryMock({
      findCounters: async (_userId, periodStart) => {
        periods.push(periodStart);
        return { aiMessages: 30, receipts: 2, voiceSeconds: 0 };
      },
    });

    const result = await currentPlanUsage('user-1', { repository, now: clock });

    expect(periods).toEqual(['2026-10-01']);
    expect(result.plan.id).toBe(PLAN.free);
    expect(result.usage.aiMessages).toEqual({ used: 30, limit: 30 });
    expect(result.usage.resetsOn).toBe('2026-11-01');
  });

  test('counts a paid plan from its monthly anniversary', async () => {
    const repository = createUsageRepositoryMock({
      findActiveSubscriptions: async () => [createSubscriptionMock()],
    });

    const usage = await getUsage('user-1', { repository, now: clock });

    expect(usage.resetsOn).toBe('2026-11-05');
    expect(usage.voiceSeconds).toEqual({ used: 0, limit: 10_800 });
  });

  test('reads the real clock and repository by default', async () => {
    expect((await getUsage('user-1')).aiMessages.limit).toBe(30);
  });
});

describe('requireVoiceAndImport', () => {
  test('lets Kira Plus through and refuses the other plans', () => {
    expect(() =>
      requireVoiceAndImport(activePlanOf([createSubscriptionMock()]), 'voice'),
    ).not.toThrow();
    expect(() => requireVoiceAndImport(activePlanOf([]), 'import')).toThrow(
      expect.objectContaining({ statusCode: 403, code: 'PLAN_FEATURE_UNAVAILABLE' }),
    );
  });
});
