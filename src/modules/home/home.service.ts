/**
 * Beranda's aggregate: which of the three layouts a person sees and the numbers each one shows.
 * Keluar dari Utang gets the debt plan (BRD-03); otherwise a person with no transaction yet gets
 * the first steps (BRD-02), and everyone else the overview (BRD-01).
 */

import { FOCUS } from '../../lib/constants/profile.ts';
import { HOME_VARIANT, MICRO_TARGET } from '../../lib/constants/home.ts';
import {
  addDays,
  paydayPeriod,
  wibDate,
  wibStartOfDay,
  type PaydayPeriod,
} from '../../lib/time/wib.ts';
import { findScoreReport, type ScoreReport } from '../score/index.ts';
import { homeRepository, type HomeAccount, type HomeRepository } from './home.repository.ts';
import type { Home } from './home.schema.ts';
import { UnauthenticatedError } from '../auth/index.ts';

export type HomeDeps = {
  repository?: HomeRepository;
  now?: () => Date;
  scoreReport?: (userId: string) => Promise<ScoreReport | null>;
};

/** A week of essential spending is seven thirtieths of a month's. */
const WEEK_SHARE = 7 / 30;

/** Sisa uang: this period's income (or the answered income) less what was spent, spread per day. */
async function moneyOf(
  userId: string,
  account: HomeAccount,
  period: PaydayPeriod,
  repository: HomeRepository,
): Promise<NonNullable<Home['money']>> {
  const totals = await repository.totalsBetween(
    userId,
    wibStartOfDay(period.start),
    wibStartOfDay(period.nextPayday),
  );
  const income = totals.income > 0 ? totals.income : (account.income ?? 0);
  const spent = totals.expense;
  const remaining = Math.max(0, income - spent);
  return {
    income,
    spent,
    remaining,
    perDay: Math.floor(remaining / Math.max(1, period.daysUntilPayday)),
    spentPercent: income > 0 ? Math.round((spent * 100) / income) : 0,
  };
}

/**
 * Sisa uang of the current payday period, in rupiah: what the payoff plan may add on top of the
 * instalments. The same figure Beranda shows, so the two screens never disagree.
 */
export async function findRemainingMoney(
  userId: string,
  deps: Pick<HomeDeps, 'repository' | 'now'> = {},
): Promise<number> {
  const repository = deps.repository ?? homeRepository;
  const now = (deps.now ?? (() => new Date()))();
  const account = await repository.findAccount(userId);
  if (!account) throw new Error('The signed-in account has no row');
  const period = paydayPeriod(wibDate(now), account.payday);
  return (await moneyOf(userId, account, period, repository)).remaining;
}

/** The seven days before today, when the person asked for the summary and recorded something then. */
async function weeklySummaryOf(userId: string, today: string, repository: HomeRepository) {
  const from = addDays(today, -7);
  const [enabled, totals] = await Promise.all([
    repository.weeklySummaryEnabled(userId),
    repository.totalsBetween(userId, wibStartOfDay(from), wibStartOfDay(today)),
  ]);
  return enabled && totals.count > 0 ? { from, to: addDays(today, -1) } : null;
}

async function debtPlanOf(userId: string, repository: HomeRepository) {
  const { original, remaining } = await repository.debtTotals(userId);
  const paidOff = Math.max(0, original - remaining);
  return {
    paidOff,
    total: original,
    remaining,
    percent: original > 0 ? Math.floor((paidOff * 100) / original) : 0,
  };
}

function microTargetOf(account: HomeAccount): Home['microTarget'] {
  if (!account.essential) return null;
  const current = account.emergencyFund ?? 0;
  const week = Math.round(account.essential * WEEK_SHARE);
  return current < week
    ? { kind: MICRO_TARGET.oneWeek, current, target: week }
    : { kind: MICRO_TARGET.oneMonth, current, target: account.essential };
}

export async function getHome(userId: string, deps: HomeDeps = {}): Promise<Home> {
  const repository = deps.repository ?? homeRepository;
  const now = (deps.now ?? (() => new Date()))();
  const scoreReport = deps.scoreReport ?? ((id: string) => findScoreReport(id, { now: () => now }));
  const [account, hasTransactions, report] = await Promise.all([
    repository.findAccount(userId),
    repository.hasTransactions(userId),
    scoreReport(userId),
  ]);
  /** The account was deleted while this request was in flight: its session is gone too. */
  if (!account) throw new UnauthenticatedError('account deleted');
  const today = wibDate(now);
  const period = paydayPeriod(today, account.payday);
  const variant =
    account.focus === FOCUS.debtFree
      ? HOME_VARIANT.debtPlan
      : hasTransactions
        ? HOME_VARIANT.overview
        : HOME_VARIANT.firstSteps;
  const [step] = report?.steps ?? [];
  const showsStep = variant !== HOME_VARIANT.firstSteps && step !== undefined;
  const overview = variant === HOME_VARIANT.overview;
  const debtPlan = variant === HOME_VARIANT.debtPlan;
  return {
    variant,
    today,
    displayName: account.displayName,
    hideBalances: account.hideBalances,
    period,
    money: overview ? await moneyOf(userId, account, period, repository) : null,
    step: showsStep ? step : null,
    stepPosition: showsStep ? { index: 1, total: report?.steps.length ?? 1 } : null,
    score: report
      ? { score: report.score, band: report.band, delta: report.delta, isInitial: report.isInitial }
      : null,
    weeklySummary: overview ? await weeklySummaryOf(userId, today, repository) : null,
    checklist:
      variant === HOME_VARIANT.firstSteps
        ? {
            healthCheck: account.healthCheckDone,
            firstTransaction: hasTransactions,
            walletAdded: false,
            paydaySet: account.payday.day !== null || account.payday.endOfMonth,
          }
        : null,
    debtPlan: debtPlan ? await debtPlanOf(userId, repository) : null,
    microTarget: debtPlan ? microTargetOf(account) : null,
  };
}
