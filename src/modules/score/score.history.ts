/**
 * Riwayat Kira Score (SKR-07, SKR-07b): a point per month, taken on the 25th (WIB) by the hourly
 * scheduler and at the first health check, and the score now against the snapshot GET /score's
 * delta is measured from: the latest one before the current payday period.
 * The sentences around the numbers ("Naik 15 poin sejak Mei") are the app's, written on device.
 */

import {
  MONTHLY_SNAPSHOT_DAY,
  SCORE_HISTORY_RANGE,
  SNAPSHOT_REASON,
} from '../../lib/constants/score.ts';
import { addMonths, monthStart, wibDate, wibStartOfDay } from '../../lib/time/wib.ts';
import { ScoreNotAvailableError } from './score.errors.ts';
import { labelsOf } from './score.labels.ts';
import { evaluate } from './score.measure.ts';
import {
  scoreHistoryRepository,
  type HistorySnapshot,
  type ScoreHistoryRepository,
} from './score.history.repository.ts';
import { scoreRepository } from './score.repository.ts';
import type { ScoreHistory } from './score.schema.ts';
import { scoreOf, snapshotOf, type ScoreDeps } from './score.service.ts';

type Range = (typeof SCORE_HISTORY_RANGE)[keyof typeof SCORE_HISTORY_RANGE];

/** The score's own repository for the answers, and the history's for the snapshots. */
export type HistoryDeps = ScoreDeps & { history?: ScoreHistoryRepository };

const RANGE_MONTHS: Record<Range, number> = {
  [SCORE_HISTORY_RANGE.sixMonths]: 6,
  [SCORE_HISTORY_RANGE.oneYear]: 12,
};

/** Monthly snapshots are read back this far, so the month before a 1 Tahun range is there too. */
const HISTORY_MONTHS = 13;

/** People snapshotted per query while the monthly job pages through them. */
const MONTHLY_BATCH = 100;

/** The month (`YYYY-MM`) a snapshot stands for: a monthly one's 25th, else the day it was taken. */
function monthOf(snapshot: HistorySnapshot): string {
  return snapshot.reason === SNAPSHOT_REASON.monthly
    ? snapshot.periodStart.slice(0, 7)
    : wibDate(snapshot.createdAt).slice(0, 7);
}

/** One snapshot per month, the later one where a month has two, oldest month first. */
function byMonth(snapshots: HistorySnapshot[]): { month: string; snapshot: HistorySnapshot }[] {
  const months = new Map<string, HistorySnapshot>();
  for (const snapshot of snapshots) months.set(monthOf(snapshot), snapshot);
  return [...months.entries()]
    .map(([month, snapshot]) => ({ month, snapshot }))
    .toSorted((a, b) => a.month.localeCompare(b.month));
}

export async function getScoreHistory(
  userId: string,
  range: Range,
  deps: HistoryDeps = {},
): Promise<ScoreHistory> {
  const repository = deps.repository ?? scoreRepository;
  const history = deps.history ?? scoreHistoryRepository;
  const now = (deps.now ?? (() => new Date()))();
  const scored = await scoreOf(userId, { repository, now: () => now });
  if (!scored) throw new ScoreNotAvailableError();
  const thisMonth = monthStart(wibDate(now));
  const since = wibStartOfDay(addMonths(thisMonth, -HISTORY_MONTHS));
  const months = byMonth(await history.listHistory(userId, since));
  const firstMonth = addMonths(thisMonth, -(RANGE_MONTHS[range] - 1)).slice(0, 7);
  /** GET /score's previous point, so both screens show the same "+N" for the same score. */
  const before = await history.findPrevious(userId, wibStartOfDay(scored.periodStart));
  const previous = before ? { month: monthOf(before), snapshot: before } : null;
  const { evaluation, report } = scored;
  const labels = labelsOf(evaluation);
  const changes = previous
    ? evaluation.indicators
        .filter(({ key }) => previous.snapshot.indicators[key] !== evaluation.points[key])
        .map(({ key }) => ({
          indicator: key,
          fromLabel: previous.snapshot.measures?.[key] ?? null,
          toLabel: labels[key],
          fromPoints: previous.snapshot.indicators[key],
          toPoints: evaluation.points[key],
        }))
    : [];
  return {
    current: {
      score: evaluation.score,
      band: evaluation.band,
      deltaFromPrevious: report.delta,
      previousMonth: previous?.month ?? null,
    },
    points: months
      .filter(({ month }) => month >= firstMonth)
      .map(({ month, snapshot }) => ({ month, score: snapshot.score })),
    changes,
    unchangedCount: previous ? evaluation.indicators.length - changes.length : 0,
  };
}

/**
 * The hourly job's monthly point: from the 25th (WIB) to the month's end, everyone with an
 * answered health check and no point for this month yet gets one, so a run missed on the 25th is
 * caught up later the same month.
 */
export async function takeMonthlySnapshots(
  now: Date,
  deps: Omit<HistoryDeps, 'now'> = {},
): Promise<{ taken: number } | { skipped: string }> {
  const repository = deps.repository ?? scoreRepository;
  const history = deps.history ?? scoreHistoryRepository;
  const today = wibDate(now);
  if (Number(today.slice(8, 10)) < MONTHLY_SNAPSHOT_DAY) return { skipped: 'before-the-25th' };
  const periodStart = `${today.slice(0, 8)}${MONTHLY_SNAPSHOT_DAY}`;

  /** One person's point; false when the answers are gone or the month already has one. */
  async function take(userId: string): Promise<boolean> {
    const [state, debts] = await Promise.all([
      repository.findState(userId),
      repository.listOpenDebts(userId),
    ]);
    if (!state?.input) return false;
    const evaluation = evaluate({ ...state.input, debts });
    const snapshot = snapshotOf(evaluation, SNAPSHOT_REASON.monthly, periodStart);
    return history.insertMonthlySnapshot(userId, snapshot);
  }

  /** A page of people at once, then the next page after the last id, until a short page. */
  async function page(afterId: string | null, taken: number): Promise<number> {
    const ids = await history.listMonthlyCandidates(periodStart, MONTHLY_BATCH, afterId);
    const outcomes = await Promise.all(ids.map(take));
    const total = taken + outcomes.filter(Boolean).length;
    const last = ids.at(-1);
    return ids.length < MONTHLY_BATCH || last === undefined ? total : page(last, total);
  }

  return { taken: await page(null, 0) };
}
