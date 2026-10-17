import { describe, expect, test } from 'bun:test';
import { DEBT_KIND, FOCUS, MARITAL_STATUS, PROTECTION } from '../../../lib/constants/profile.ts';
import { SCORE_BAND, SNAPSHOT_REASON } from '../../../lib/constants/score.ts';
import { createFakeDb, inOrder } from '../../../test/fake-postgres.ts';
import { pointsOf, factsOf } from '../score.engine.ts';
import { labelsOf } from '../score.labels.ts';
import { evaluate } from '../score.measure.ts';
import { createScoreRepository } from '../score.repository.ts';
import type { HealthCheckBody } from '../score.schema.ts';
import { DINDA, DINDA_ANSWERS, DINDA_DEBTS, NOW } from './helpers.ts';

const SNAPSHOT = {
  score: 66,
  band: SCORE_BAND.coping,
  indicators: pointsOf(factsOf(DINDA)),
  measures: labelsOf(evaluate(DINDA)),
  reason: SNAPSHOT_REASON.healthCheck,
  periodStart: '2026-09-25',
};

const stateRow = (completedAt: string | null) => ({
  focus: FOCUS.trackSpending,
  paydayDay: 25,
  paydayEndOfMonth: false,
  completedAt,
  income: DINDA_ANSWERS.income,
  essential: DINDA_ANSWERS.essential,
  emergencyFund: DINDA_ANSWERS.emergencyFund,
  monthlySavings: DINDA_ANSWERS.monthlySavings,
  otherAssets: DINDA_ANSWERS.otherAssets,
  propertyAssets: DINDA_ANSWERS.propertyAssets,
  dependents: completedAt ? 0 : null,
  maritalStatus: completedAt ? MARITAL_STATUS.single : null,
  protections: completedAt ? `{${DINDA_ANSWERS.protections.join(',')}}` : null,
});

describe('createScoreRepository', () => {
  test('reads the answers and the account settings, or none before the quiz', async () => {
    const fake = createFakeDb(inOrder([stateRow(NOW.toISOString())], [stateRow(null)], []));
    const repository = createScoreRepository(fake.db);

    expect(await repository.findState('user-1')).toEqual({
      focus: FOCUS.trackSpending,
      payday: { day: 25, endOfMonth: false },
      input: DINDA_ANSWERS,
    });
    expect(await repository.findState('user-1')).toEqual({
      focus: FOCUS.trackSpending,
      payday: { day: 25, endOfMonth: false },
      input: null,
    });
    expect(await repository.findState('user-1')).toBeNull();
    expect(fake.queries[0]?.sql).toContain('left join "financial_profiles"');
  });

  test('lists the open debt accounts with a limit', async () => {
    const fake = createFakeDb(inOrder(DINDA_DEBTS));
    expect(await createScoreRepository(fake.db).listOpenDebts('user-1')).toEqual(DINDA_DEBTS);
    expect(fake.queries[0]?.sql).toContain('"paid_off_at" is null');
    expect(fake.queries[0]?.sql).toContain('limit $2');
  });

  test('summarises the snapshots around the period start', async () => {
    const fake = createFakeDb((query) =>
      query.sql.includes('count(')
        ? [{ count: 2, latestInPeriodAt: NOW.toISOString() }]
        : [{ score: 62 }],
    );
    const history = await createScoreRepository(fake.db).snapshotHistory('user-1', NOW);

    expect(history).toEqual({ count: 2, latestInPeriodAt: NOW, previousScore: 62 });
    expect(fake.queries.some((query) => query.sql.includes('filter (where'))).toBe(true);
  });

  test('reads an empty history', async () => {
    const fake = createFakeDb(() => []);
    expect(await createScoreRepository(fake.db).snapshotHistory('user-1', NOW)).toEqual({
      count: 0,
      latestInPeriodAt: null,
      previousScore: null,
    });
  });

  test('inserts a snapshot', async () => {
    const fake = createFakeDb();
    await createScoreRepository(fake.db).insertSnapshot('user-1', SNAPSHOT);
    expect(fake.queries[0]?.sql).toStartWith('insert into "score_snapshots"');
    expect(fake.queries[0]?.sql).toContain(
      `on conflict ("user_id","period_start") where "score_snapshots"."reason" = '${SNAPSHOT_REASON.recompute}' do nothing`,
    );
  });

  test('saves the health check in one transaction, replacing the debts', async () => {
    const body: HealthCheckBody = {
      netMonthlyIncome: 7_500_000,
      payday: { day: null, endOfMonth: true },
      essentialMonthlyExpenses: null,
      debts: [
        {
          kind: DEBT_KIND.paylater,
          name: 'Paylater A',
          remaining: 420_000,
          monthlyInstalment: 210_000,
          remainingTenorMonths: null,
          annualInterestRate: 36,
          dueDay: 5,
        },
      ],
      emergencyFund: null,
      monthlySavings: null,
      otherAssets: null,
      propertyAssets: null,
      dependents: 1,
      maritalStatus: null,
      protections: [PROTECTION.bpjsHealth],
    };
    const fake = createFakeDb();
    const repository = createScoreRepository(fake.db);
    await repository.saveHealthCheck('user-1', body, SNAPSHOT, NOW);
    await repository.saveHealthCheck('user-1', { ...body, debts: [] }, SNAPSHOT, NOW);

    expect(
      fake.queries.slice(0, 5).map((query) => query.sql.split(' ').slice(0, 3).join(' ')),
    ).toEqual([
      'insert into "financial_profiles"',
      'delete from "debt_accounts"',
      'insert into "debt_accounts"',
      'update "users" set',
      'insert into "score_snapshots"',
    ]);
    expect(fake.queries[0]?.sql).toContain('on conflict ("user_id") do update');
    expect(fake.queries[2]?.params).toContain(420_000);
    expect(fake.queries[2]?.sql).toContain('"annual_interest_rate"');
    expect(fake.queries[2]?.params).toContain('36');
    expect(fake.queries).toHaveLength(9);
  });
});
