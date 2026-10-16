import { describe, expect, test } from 'bun:test';
import { PLAN, SUBSCRIPTION_SOURCE, SUBSCRIPTION_STATUS } from '../../../lib/constants/plans.ts';
import { createFakeDb, inOrder } from '../../../test/fake-postgres.ts';
import { createUsageRepository } from '../usage.repository.ts';
import { NOW } from './helpers.ts';

describe('createUsageRepository', () => {
  test('finds the active subscription of a person', async () => {
    const row = {
      plan: PLAN.young,
      source: SUBSCRIPTION_SOURCE.purchase,
      status: SUBSCRIPTION_STATUS.active,
      currentPeriodStart: NOW.toISOString(),
      currentPeriodEnd: NOW.toISOString(),
    };
    const fake = createFakeDb(inOrder([row]));

    const rows = await createUsageRepository(fake.db).findActiveSubscriptions('user-1');

    expect(rows).toEqual([{ ...row, currentPeriodStart: NOW, currentPeriodEnd: NOW }]);
    expect(fake.queries[0]?.sql).toContain('"subscriptions"."status" = $2');
    expect(fake.queries[0]?.params).toEqual(['user-1', SUBSCRIPTION_STATUS.active, 1]);
  });

  test('finds the counters of a quota period, or null', async () => {
    const fake = createFakeDb(inOrder([{ aiMessages: 3, receipts: 1, voiceSeconds: 40 }], []));
    const repository = createUsageRepository(fake.db);

    expect(await repository.findCounters('user-1', '2026-10-01')).toEqual({
      aiMessages: 3,
      receipts: 1,
      voiceSeconds: 40,
    });
    expect(await repository.findCounters('user-1', '2026-10-01')).toBeNull();
    expect(fake.queries[0]?.sql).toContain('"usage_counters"."period_start" = $2');
  });
});
