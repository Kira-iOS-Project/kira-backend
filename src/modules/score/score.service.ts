/**
 * The Kira Score's business rules: saving the health check, reading the score of the current payday
 * period and one indicator's detail. The score is recomputed from the answers on every read; a
 * snapshot is kept once per payday period ("Skor dicek lagi otomatis setiap gajian"), which is what
 * the delta compares against.
 */

import { DEBT_PAYMENT_STATUS } from '../../lib/constants/profile.ts';
import { INDICATOR, SNAPSHOT_REASON } from '../../lib/constants/score.ts';
import { paydayPeriod, wibDate, wibStartOfDay } from '../../lib/time/wib.ts';
import type { DebtInput, IndicatorKey, ScoreInput } from './score.engine.ts';
import { ScoreNotAvailableError } from './score.errors.ts';
import { labelsOf } from './score.labels.ts';
import { ladderOf } from './score.ladder.ts';
import { evaluate, type Evaluation } from './score.measure.ts';
import { scoreRepository, type NewSnapshot, type ScoreRepository } from './score.repository.ts';
import type { HealthCheckBody, IndicatorDetail, ScoreReport } from './score.schema.ts';
import { stepsFor } from './score.steps.ts';

export type ScoreDeps = { repository?: ScoreRepository; now?: () => Date };

/** The evaluation, its report, and the first day of the payday period the delta is measured from. */
export type Scored = { evaluation: Evaluation; report: ScoreReport; periodStart: string };

export function snapshotOf(
  evaluation: Evaluation,
  reason: NewSnapshot['reason'],
  periodStart: string,
): NewSnapshot {
  const { score, band, points } = evaluation;
  return { score, band, indicators: points, measures: labelsOf(evaluation), reason, periodStart };
}

/** Scores the answers on file, taking this period's snapshot if there is none yet; null before the quiz. */
export async function scoreOf(userId: string, deps: ScoreDeps): Promise<Scored | null> {
  const repository = deps.repository ?? scoreRepository;
  const now = (deps.now ?? (() => new Date()))();
  const state = await repository.findState(userId);
  if (!state?.input) return null;
  const period = paydayPeriod(wibDate(now), state.payday);
  const [debts, history] = await Promise.all([
    repository.listOpenDebts(userId),
    repository.snapshotHistory(userId, wibStartOfDay(period.start)),
  ]);
  const input: ScoreInput = { ...state.input, debts };
  const evaluation = evaluate(input);
  let { count, latestInPeriodAt } = history;
  if (latestInPeriodAt === null) {
    await repository.insertSnapshot(
      userId,
      snapshotOf(evaluation, SNAPSHOT_REASON.recompute, period.start),
    );
    count += 1;
    latestInPeriodAt = now;
  }
  const { score, band, groups, indicators, cappedByConsumerDebt } = evaluation;
  const report: ScoreReport = {
    score,
    band,
    delta: history.previousScore === null ? null : score - history.previousScore,
    isInitial: count === 1,
    computedAt: latestInPeriodAt.toISOString(),
    nextCheckOn: period.nextPayday,
    groups,
    indicators,
    steps: stepsFor(input, state.focus),
    cappedByConsumerDebt,
  };
  return { evaluation, report, periodStart: period.start };
}

/** The score report, or null before the health check: Beranda shows no score card then. */
export async function findScoreReport(
  userId: string,
  deps: ScoreDeps = {},
): Promise<ScoreReport | null> {
  return (await scoreOf(userId, deps))?.report ?? null;
}

export async function getScoreReport(userId: string, deps: ScoreDeps = {}): Promise<ScoreReport> {
  const report = await findScoreReport(userId, deps);
  if (!report) throw new ScoreNotAvailableError();
  return report;
}

export async function getIndicatorDetail(
  userId: string,
  key: IndicatorKey,
  deps: ScoreDeps = {},
): Promise<IndicatorDetail> {
  const scored = await scoreOf(userId, deps);
  if (!scored) throw new ScoreNotAvailableError();
  const { evaluation } = scored;
  const indicator = evaluation.indicators.find((item) => item.key === key);
  if (!indicator) throw new ScoreNotAvailableError();
  return { ...indicator, ...ladderOf(key, evaluation.facts, evaluation.points) };
}

/** The score before and after an account was paid off; the official score waits for payday. */
export type ScoreEstimate = {
  before: number;
  after: number;
  consumerDebtBefore: number;
  consumerDebtAfter: number;
};

/**
 * What paying off `paid` is worth: the score with the open accounts now, less the score with `paid`
 * still among them. Null before the health check.
 */
export async function estimateScoreChange(
  userId: string,
  paid: DebtInput,
  deps: ScoreDeps = {},
): Promise<ScoreEstimate | null> {
  const repository = deps.repository ?? scoreRepository;
  const state = await repository.findState(userId);
  if (!state?.input) return null;
  const debts = await repository.listOpenDebts(userId);
  const after = evaluate({ ...state.input, debts });
  const before = evaluate({ ...state.input, debts: [...debts, paid] });
  return {
    before: before.score,
    after: after.score,
    consumerDebtBefore: before.points[INDICATOR.consumerDebt],
    consumerDebtAfter: after.points[INDICATOR.consumerDebt],
  };
}

/** Saves the answers and returns the first score; the quiz never asks how a debt is being paid. */
export async function saveHealthCheck(
  userId: string,
  body: HealthCheckBody,
  deps: ScoreDeps = {},
): Promise<ScoreReport> {
  const repository = deps.repository ?? scoreRepository;
  const now = (deps.now ?? (() => new Date()))();
  const evaluation = evaluate({
    income: body.netMonthlyIncome,
    essential: body.essentialMonthlyExpenses,
    emergencyFund: body.emergencyFund,
    monthlySavings: body.monthlySavings,
    otherAssets: body.otherAssets,
    propertyAssets: body.propertyAssets,
    dependents: body.dependents,
    maritalStatus: body.maritalStatus,
    protections: body.protections,
    debts: body.debts.map((debt) => ({ ...debt, paymentStatus: DEBT_PAYMENT_STATUS.onTime })),
  });
  await repository.saveHealthCheck(
    userId,
    body,
    snapshotOf(
      evaluation,
      SNAPSHOT_REASON.healthCheck,
      paydayPeriod(wibDate(now), body.payday).start,
    ),
    now,
  );
  return getScoreReport(userId, { repository, now: () => now });
}
