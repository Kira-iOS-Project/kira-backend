import { describe, expect, test } from 'bun:test';
import { FOCUS } from '../../../lib/constants/profile.ts';
import { INDICATOR, SCORE_HISTORY_RANGE, SNAPSHOT_REASON } from '../../../lib/constants/score.ts';
import type { HistorySnapshot } from '../score.history.repository.ts';
import { getScoreHistory, takeMonthlySnapshots } from '../score.history.ts';
import { getScoreReport } from '../score.service.ts';
import type { NewSnapshot } from '../score.repository.ts';
import {
  createScoreHistoryRepositoryMock,
  createScoreRepositoryMock,
  LABELS,
  monthly,
  NOW,
  POINTS,
  snapshot,
} from './helpers.ts';

/**
 * The history of `snapshots` on NOW (16 October 2026, payday the 25th, so the period began on
 * 25 September, WIB) over `range`, with `previous` as the latest snapshot before that period.
 */
function historyOf(
  snapshots: HistorySnapshot[],
  range: (typeof SCORE_HISTORY_RANGE)[keyof typeof SCORE_HISTORY_RANGE] = SCORE_HISTORY_RANGE.sixMonths,
  previous: HistorySnapshot | null = null,
) {
  const history = createScoreHistoryRepositoryMock({
    listHistory: async () => snapshots,
    findPrevious: async (_userId, before) => {
      expect(before.toISOString()).toBe('2026-09-24T17:00:00.000Z');
      return previous;
    },
  });
  return getScoreHistory('user-1', range, {
    repository: createScoreRepositoryMock(),
    history,
    now: () => NOW,
  });
}

describe('getScoreHistory', () => {
  test('throws SCORE_NOT_AVAILABLE before the health check', async () => {
    const repository = createScoreRepositoryMock({
      findState: async () => ({
        focus: FOCUS.trackSpending,
        payday: { day: 25, endOfMonth: false },
        input: null,
      }),
    });
    expect(
      getScoreHistory('user-1', SCORE_HISTORY_RANGE.sixMonths, { repository, now: () => NOW }),
    ).rejects.toMatchObject({ code: 'SCORE_NOT_AVAILABLE' });
  });

  test('plots one point a month inside the range, the later one where a month has two', async () => {
    const snapshots = [
      snapshot({
        reason: SNAPSHOT_REASON.healthCheck,
        periodStart: '2025-10-25',
        createdAt: new Date('2025-11-02T03:00:00.000Z'),
        score: 40,
      }),
      monthly('2026-03', 50),
      snapshot({
        reason: SNAPSHOT_REASON.healthCheck,
        periodStart: '2026-04-25',
        createdAt: new Date('2026-05-03T03:00:00.000Z'),
        score: 51,
      }),
      monthly('2026-05', 52),
      monthly('2026-09', 62),
    ];
    expect((await historyOf(snapshots)).points).toEqual([
      { month: '2026-05', score: 52 },
      { month: '2026-09', score: 62 },
    ]);
    const year = await historyOf(snapshots, SCORE_HISTORY_RANGE.oneYear);
    expect(year.points.map((point) => point.month)).toEqual([
      '2025-11',
      '2026-03',
      '2026-05',
      '2026-09',
    ]);
  });

  test('names what moved since the snapshot before this payday period', async () => {
    const before = { ...POINTS, [INDICATOR.emergencyFund]: POINTS[INDICATOR.emergencyFund] - 25 };
    const last = snapshot({
      indicators: before,
      measures: { ...LABELS, [INDICATOR.emergencyFund]: '0,8×' },
    });
    const result = await historyOf([last], SCORE_HISTORY_RANGE.sixMonths, last);
    expect(result.current.previousMonth).toBe('2026-09');
    expect(result.changes).toEqual([
      {
        indicator: INDICATOR.emergencyFund,
        fromLabel: '0,8×',
        toLabel: LABELS[INDICATOR.emergencyFund],
        fromPoints: before[INDICATOR.emergencyFund],
        toPoints: POINTS[INDICATOR.emergencyFund],
      },
    ]);
    expect(result.unchangedCount).toBe(5);
  });

  test('leaves the earlier figure out when that snapshot did not keep it', async () => {
    const old = snapshot({
      indicators: { ...POINTS, [INDICATOR.savingsRatio]: 0 },
      measures: null,
    });
    const result = await historyOf([old], SCORE_HISTORY_RANGE.sixMonths, old);
    expect(result.changes[0]?.fromLabel).toBeNull();
  });

  test("takes GET /score's delta and names the snapshot it is measured from", async () => {
    /** A health check redone on 20 September: after August's point, before the period began. */
    const redone = snapshot({
      reason: SNAPSHOT_REASON.healthCheck,
      periodStart: '2026-08-25',
      createdAt: new Date('2026-09-20T03:00:00.000Z'),
      score: 58,
    });
    const repository = createScoreRepositoryMock({
      snapshotHistory: async () => ({ count: 3, latestInPeriodAt: NOW, previousScore: 58 }),
    });
    const history = createScoreHistoryRepositoryMock({
      listHistory: async () => [monthly('2026-08', 55), redone],
      findPrevious: async () => redone,
    });
    const result = await getScoreHistory('user-1', SCORE_HISTORY_RANGE.sixMonths, {
      repository,
      history,
      now: () => NOW,
    });
    const report = await getScoreReport('user-1', { repository, now: () => NOW });
    expect(result.current.deltaFromPrevious).toBe(report.delta);
    expect(result.current.deltaFromPrevious).toBe(result.current.score - 58);
    expect(result.current.previousMonth).toBe('2026-09');
  });

  test('has nothing to compare before a first payday period has passed', async () => {
    const result = await historyOf([
      snapshot({
        reason: SNAPSHOT_REASON.healthCheck,
        periodStart: '2026-09-25',
        createdAt: new Date('2026-10-02T03:00:00.000Z'),
      }),
    ]);
    expect(result.points).toEqual([{ month: '2026-10', score: 62 }]);
    expect(result.current).toMatchObject({ deltaFromPrevious: null, previousMonth: null });
    expect(result.changes).toEqual([]);
    expect(result.unchangedCount).toBe(0);
  });
});

describe('takeMonthlySnapshots', () => {
  test('waits for the 25th (WIB)', async () => {
    const outcome = await takeMonthlySnapshots(new Date('2026-10-24T16:59:00.000Z'), {
      repository: createScoreRepositoryMock(),
      history: createScoreHistoryRepositoryMock(),
    });
    expect(outcome).toEqual({ skipped: 'before-the-25th' });
  });

  test('snapshots everyone still without this month, page by page, once each', async () => {
    const pages: (string | null)[] = [];
    const inserted: { userId: string; taken: NewSnapshot }[] = [];
    const first = Array.from(
      { length: 100 },
      (_, index) => `user-${String(index).padStart(3, '0')}`,
    );
    const history = createScoreHistoryRepositoryMock({
      listMonthlyCandidates: async (periodStart, _limit, afterId) => {
        expect(periodStart).toBe('2026-10-25');
        pages.push(afterId);
        return afterId === null ? first : ['user-100'];
      },
      insertMonthlySnapshot: async (userId, taken) => {
        inserted.push({ userId, taken });
        return userId !== 'user-100';
      },
    });
    const outcome = await takeMonthlySnapshots(new Date('2026-10-24T17:00:00.000Z'), {
      repository: createScoreRepositoryMock(),
      history,
    });
    expect(pages).toEqual([null, 'user-099']);
    expect(outcome).toEqual({ taken: 100 });
    expect(inserted[0]?.taken).toMatchObject({
      reason: SNAPSHOT_REASON.monthly,
      periodStart: '2026-10-25',
      indicators: POINTS,
      measures: LABELS,
    });
  });

  test('skips a person whose answers are gone', async () => {
    let inserts = 0;
    const history = createScoreHistoryRepositoryMock({
      listMonthlyCandidates: async () => ['user-1'],
      insertMonthlySnapshot: async () => {
        inserts += 1;
        return true;
      },
    });
    const outcome = await takeMonthlySnapshots(new Date('2026-10-28T00:00:00.000Z'), {
      repository: createScoreRepositoryMock({ findState: async () => null }),
      history,
    });
    expect(outcome).toEqual({ taken: 0 });
    expect(inserts).toBe(0);
  });
});
