/**
 * Rencana Pelunasan's simulation: the consumer debts of a person ordered by the method they chose,
 * with the month and interest of each, set against the other method. Productive debts (home,
 * vehicle, family) stay out of the plan and are only listed.
 */

import { PAYOFF_METHOD } from '../../lib/constants/payoff.ts';
import { wibDate } from '../../lib/time/wib.ts';
import { findRemainingMoney } from '../home/index.ts';
import { isConsumerDebt } from '../score/index.ts';
import {
  simulate,
  simulateInOrder,
  type PayoffMethod,
  type PayoffDebt,
  type Simulation,
} from './payoff.engine.ts';
import { PayoffExtraTooHighError } from './payoff.errors.ts';
import { paymentDate, paymentMonth } from './payoff.plan.view.ts';
import { payoffRepository, type PayoffRepository } from './payoff.repository.ts';
import type { PayoffPlan, SimulatePayoffBody } from './payoff.schema.ts';

export type PayoffDeps = {
  repository?: PayoffRepository;
  now?: () => Date;
  remainingMoney?: (userId: string) => Promise<number>;
};

const otherOf = (method: PayoffMethod): PayoffMethod =>
  method === PAYOFF_METHOD.snowball ? PAYOFF_METHOD.avalanche : PAYOFF_METHOD.snowball;

/** The first account's months: how long until the plan clears its first debt. */
const firstMonths = (simulation: Simulation) => simulation.accounts[0]?.months ?? null;

function comparisonOf(
  chosen: Simulation,
  other: Simulation,
  method: PayoffMethod,
  hasRate: boolean,
) {
  const first = firstMonths(chosen);
  const otherFirst = firstMonths(other);
  return {
    otherMethod: otherOf(method),
    interestSaved:
      hasRate && chosen.totalInterest !== null && other.totalInterest !== null
        ? other.totalInterest - chosen.totalInterest
        : null,
    firstPayoffMonthsLater: first !== null && otherFirst !== null ? otherFirst - first : null,
  };
}

/** Sisa uang of this period, from the Beranda figure unless a test supplies another. */
export function remainingOf(
  userId: string,
  deps: Pick<PayoffDeps, 'now' | 'remainingMoney'>,
): Promise<number> {
  if (deps.remainingMoney) return deps.remainingMoney(userId);
  return findRemainingMoney(userId, deps.now ? { now: deps.now } : {});
}

/** The latest of the values (ISO months or dates sort as text); null if any is missing or none. */
function latestOf(values: (string | null)[]) {
  const known = values.filter((value): value is string => value !== null);
  if (known.length < values.length) return null;
  return known.toSorted((a, b) => a.localeCompare(b)).at(-1) ?? null;
}

/** The payoff month, and the due date when the account has a due day (payoff.plan.view). */
function dated(today: string, dueDay: number | null, months: number | null) {
  return {
    payoffMonth: paymentMonth(today, dueDay, months),
    payoffDate: paymentDate(today, dueDay, months),
  };
}

export async function simulatePayoff(
  userId: string,
  body: SimulatePayoffBody,
  deps: PayoffDeps = {},
): Promise<PayoffPlan> {
  const repository = deps.repository ?? payoffRepository;
  const today = wibDate((deps.now ?? (() => new Date()))());
  const [open, maxExtraPayment] = await Promise.all([
    repository.listOpenDebts(userId),
    remainingOf(userId, deps),
  ]);
  if (body.extraPayment > maxExtraPayment) throw new PayoffExtraTooHighError();

  const consumer: PayoffDebt[] = open.filter(isConsumerDebt);
  /** A productive debt carries on alone, on its own instalment, outside the plan. */
  const productive = open
    .filter((debt) => !isConsumerDebt(debt))
    .map((debt) => {
      const months = simulateInOrder([debt], 0).accounts[0]?.months ?? null;
      const { id, kind, name, remaining, monthlyInstalment } = debt;
      return Object.assign(
        { id, kind, name, remaining, monthlyInstalment },
        dated(today, debt.dueDay, months),
      );
    });
  const chosen = simulate(consumer, body.method, body.extraPayment);
  const other = simulate(consumer, otherOf(body.method), body.extraPayment);
  const hasRate = consumer.some((debt) => debt.annualInterestRate !== null);
  const accounts = chosen.accounts.map((account) =>
    Object.assign({}, account, dated(today, account.dueDay, account.months)),
  );

  return {
    method: body.method,
    extraPayment: body.extraPayment,
    maxExtraPayment,
    monthlyBudget:
      consumer.reduce((sum, debt) => sum + debt.monthlyInstalment, 0) + body.extraPayment,
    hasUnknownRate: consumer.some((debt) => debt.annualInterestRate === null),
    accounts,
    productive,
    totalInterest: chosen.totalInterest,
    allPaidMonths: chosen.allPaidMonths,
    /** Accounts without a due day count from this month, so the latest month is the last one. */
    allPaidMonth: latestOf(accounts.map((account) => account.payoffMonth)),
    /** The date of the last payment; null unless every account has a due day. */
    allPaidDate: latestOf(accounts.map((account) => account.payoffDate)),
    comparison: consumer.length > 0 ? comparisonOf(chosen, other, body.method, hasRate) : null,
  };
}
