import { describe, expect, test } from 'bun:test';
import { CONSENT_PURPOSE } from '../../../lib/constants/consents.ts';
import { FOCUS } from '../../../lib/constants/profile.ts';
import { createFakeDb, inOrder } from '../../../test/fake-postgres.ts';
import { createHomeRepository } from '../home.repository.ts';
import { NOW } from './helpers.ts';

const accountRow = (completedAt: string | null) => ({
  displayName: 'Dinda',
  hideBalances: true,
  focus: FOCUS.debtFree,
  paydayDay: null,
  paydayEndOfMonth: true,
  completedAt,
  income: completedAt ? 7_500_000 : null,
  essential: null,
  emergencyFund: null,
});

describe('createHomeRepository', () => {
  test('reads the account with its health-check amounts', async () => {
    const fake = createFakeDb(inOrder([accountRow(NOW.toISOString())], [accountRow(null)], []));
    const repository = createHomeRepository(fake.db);

    expect(await repository.findAccount('user-1')).toEqual({
      displayName: 'Dinda',
      hideBalances: true,
      focus: FOCUS.debtFree,
      payday: { day: null, endOfMonth: true },
      healthCheckDone: true,
      income: 7_500_000,
      essential: null,
      emergencyFund: null,
    });
    expect((await repository.findAccount('user-1'))?.healthCheckDone).toBe(false);
    expect(await repository.findAccount('user-1')).toBeNull();
  });

  test('finds whether any transaction exists', async () => {
    const fake = createFakeDb(inOrder([{ id: 'tx-1' }], []));
    const repository = createHomeRepository(fake.db);

    expect(await repository.hasTransactions('user-1')).toBe(true);
    expect(await repository.hasTransactions('user-1')).toBe(false);
    expect(fake.queries[0]?.sql).toContain('limit $2');
  });

  test('totals a window of transactions by type', async () => {
    const fake = createFakeDb(
      inOrder([{ income: '7500000', expense: '5660000', count: '12' }], []),
    );
    const repository = createHomeRepository(fake.db);

    expect(await repository.totalsBetween('user-1', NOW, NOW)).toEqual({
      income: 7_500_000,
      expense: 5_660_000,
      count: 12,
    });
    expect(await repository.totalsBetween('user-1', NOW, NOW)).toEqual({
      income: 0,
      expense: 0,
      count: 0,
    });
    expect(fake.queries[0]?.sql).toContain('"occurred_at" < $');
  });

  test('reads the latest weekly-summary decision', async () => {
    const fake = createFakeDb(inOrder([{ granted: true }], []));
    const repository = createHomeRepository(fake.db);

    expect(await repository.weeklySummaryEnabled('user-1')).toBe(true);
    expect(await repository.weeklySummaryEnabled('user-1')).toBe(false);
    expect(fake.queries[0]?.params).toContain(CONSENT_PURPOSE.weeklySummary);
  });

  test('totals the debt accounts', async () => {
    const fake = createFakeDb(inOrder([{ original: '20000000', remaining: '18400000' }], []));
    const repository = createHomeRepository(fake.db);

    expect(await repository.debtTotals('user-1')).toEqual({
      original: 20_000_000,
      remaining: 18_400_000,
    });
    expect(await repository.debtTotals('user-1')).toEqual({ original: 0, remaining: 0 });
  });
});
