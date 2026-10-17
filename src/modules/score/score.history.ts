/**
 * Riwayat Kira Score (SKR-07, SKR-07b): a point per month, taken on the 25th (WIB) by the hourly
 * scheduler and at the first health check, and the score now against the latest earlier month.
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
import { scoreRepository, type HistorySnapshot } from './score.repository.ts';
import type { ScoreHistory } from './score.schema.ts';
import { scoreOf, snapshotOf, type ScoreDeps } from './score.service.ts';

type Range = (typeof SCORE_HISTORY_RANGE)[keyof typeof SCORE_HISTORY_RANGE];

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
    .sort((a, b) => a.month.localeCompare(b.month));
}

export async function getScoreHistory(
  userId: string,
  range: Range,
  deps: ScoreDeps = {},
): Promise<ScoreHistory> {
  const repository = deps.repository ?? scoreRepository;
  const now = (deps.now ?? (() => new Date()))();
  const scored = await scoreOf(userId, { repository, now: () => now });
  if (!scored) throw new ScoreNotAvailableError();
  const thisMonth = monthStart(wibDate(now));
  const since = wibStartOfDay(addMonths(thisMonth, -HISTORY_MONTHS));
  const months = byMonth(await repository.listHistory(userId, since));
  const firstMonth = addMonths(thisMonth, -(RANGE_MONTHS[range] - 1)).slice(0, 7);
  const previous = months.filter(({ month }) => month < thisMonth.slice(0, 7)).at(-1) ?? null;
  const { evaluation } = scored;
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
      deltaFromPrevious: previous ? evaluation.score - previous.snapshot.score : null,
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
  deps: Pick<ScoreDeps, 'repository'> = {},
): Promise<{ taken: number } | { skipped: string }> {
  const repository = deps.repository ?? scoreRepository;
  const today = wibDate(now);
  if (Number(today.slice(8, 10)) < MONTHLY_SNAPSHOT_DAY) return { skipped: 'before-the-25th' };
  const periodStart = `${today.slice(0, 8)}${MONTHLY_SNAPSHOT_DAY}`;
  let taken = 0;
  let afterId: string | null = null;
  for (;;) {
    const ids = await repository.listMonthlyCandidates(periodStart, MONTHLY_BATCH, afterId);
    for (const userId of ids) {
      const state = await repository.findState(userId);
      if (!state?.input) continue;
      const debts = await repository.listOpenDebts(userId);
      const evaluation = evaluate({ ...state.input, debts });
      const snapshot = snapshotOf(evaluation, SNAPSHOT_REASON.monthly, periodStart);
      if (await repository.insertMonthlySnapshot(userId, snapshot)) taken += 1;
    }
    if (ids.length < MONTHLY_BATCH) return { taken };
    afterId = ids.at(-1) ?? null;
  }
}
