import { describe, expect, test } from 'bun:test';
import { SCORE_BAND, SNAPSHOT_REASON } from '../../../lib/constants/score.ts';
import { createFakeDb } from '../../../test/fake-postgres.ts';
import { factsOf, pointsOf } from '../score.engine.ts';
import { createScoreHistoryRepository } from '../score.history.repository.ts';
import { labelsOf } from '../score.labels.ts';
import { evaluate } from '../score.measure.ts';
import { DINDA, NOW } from './helpers.ts';

const SNAPSHOT = {
  score: 66,
  band: SCORE_BAND.coping,
  indicators: pointsOf(factsOf(DINDA)),
  measures: labelsOf(evaluate(DINDA)),
  reason: SNAPSHOT_REASON.healthCheck,
  periodStart: '2026-09-25',
};

describe('createScoreHistoryRepository', () => {
  test('reads the monthly snapshots since a day and the first health check, oldest first', async () => {
    const row = (reason: string, createdAt: string) => ({
      reason,
      periodStart: '2026-09-25',
      createdAt,
      score: 62,
      indicators: SNAPSHOT.indicators,
      measures: null,
    });
    const fake = createFakeDb((query) =>
      query.params.includes(SNAPSHOT_REASON.monthly)
        ? [row(SNAPSHOT_REASON.monthly, '2026-09-25T00:00:00.000Z')]
        : [row(SNAPSHOT_REASON.healthCheck, '2026-08-02T03:00:00.000Z')],
    );
    const history = await createScoreHistoryRepository(fake.db).listHistory('user-1', NOW);
    expect(history.map((item) => item.reason)).toEqual([
      SNAPSHOT_REASON.healthCheck,
      SNAPSHOT_REASON.monthly,
    ]);
    expect(fake.queries.map((query) => query.sql).join('\n')).toContain(
      'order by "score_snapshots"."created_at" asc',
    );
  });

  test('pages the people still without a monthly snapshot by id', async () => {
    const fake = createFakeDb(() => [{ id: 'user-2' }]);
    const repository = createScoreHistoryRepository(fake.db);
    expect(await repository.listMonthlyCandidates('2026-10-25', 100, 'user-1')).toEqual(['user-2']);
    const [query] = fake.queries;
    expect(query?.sql).toContain('not exists');
    expect(query?.sql).toContain('"financial_profiles"."completed_at" is not null');
    expect(query?.params).toEqual(expect.arrayContaining(['user-1', '2026-10-25', 100]));
    await repository.listMonthlyCandidates('2026-10-25', 100, null);
    expect(fake.queries[1]?.sql).not.toContain('"financial_profiles"."user_id" >');
  });

  test('stores a monthly snapshot once, by the monthly index', async () => {
    let rows = [{ id: 'snapshot-1' }];
    const fake = createFakeDb(() => rows);
    const repository = createScoreHistoryRepository(fake.db);
    const monthly = { ...SNAPSHOT, reason: SNAPSHOT_REASON.monthly, periodStart: '2026-10-25' };
    expect(await repository.insertMonthlySnapshot('user-1', monthly)).toBe(true);
    expect(fake.queries[0]?.sql).toContain('on conflict ("user_id","monthly_on") do nothing');
    rows = [];
    expect(await repository.insertMonthlySnapshot('user-1', monthly)).toBe(false);
  });

  test('lists every snapshot for the export, oldest first', async () => {
    const fake = createFakeDb(() => [
      {
        reason: SNAPSHOT_REASON.healthCheck,
        createdAt: NOW.toISOString(),
        score: 66,
        band: SCORE_BAND.coping,
      },
    ]);
    const snapshots = await createScoreHistoryRepository(fake.db).listSnapshots('user-1');
    expect(snapshots).toEqual([
      { reason: SNAPSHOT_REASON.healthCheck, createdAt: NOW, score: 66, band: SCORE_BAND.coping },
    ]);
    expect(fake.queries[0]?.sql).toContain('order by "score_snapshots"."created_at" asc');
  });

  test('finds the latest snapshot before the payday period, or none', async () => {
    let rows: Record<string, unknown>[] = [
      {
        reason: SNAPSHOT_REASON.healthCheck,
        periodStart: '2026-08-25',
        createdAt: '2026-09-20T03:00:00.000Z',
        score: 58,
        indicators: SNAPSHOT.indicators,
        measures: null,
      },
    ];
    const fake = createFakeDb(() => rows);
    const repository = createScoreHistoryRepository(fake.db);
    expect((await repository.findPrevious('user-1', NOW))?.score).toBe(58);
    expect(fake.queries[0]?.sql).toContain('order by "score_snapshots"."created_at" desc limit');
    rows = [];
    expect(await repository.findPrevious('user-1', NOW)).toBeNull();
  });
});
