/**
 * Rencana Pelunasan's simulation: the consumer debts of a person ordered by the method they chose,
 * with the month and interest of each, set against the other method. Productive debts (home,
 * vehicle, family) stay out of the plan and are only listed.
 */

import { PAYOFF_METHOD } from '../../lib/constants/payoff.ts';
import { addMonths, wibDate } from '../../lib/time/wib.ts';
import { findRemainingMoney } from '../home/index.ts';
import { isConsumerDebt } from '../score/index.ts';
import { simulate, type PayoffMethod, type PayoffDebt, type Simulation } from './payoff.engine.ts';
import { PayoffExtraTooHighError } from './payoff.errors.ts';
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
function remainingOf(userId: string, deps: PayoffDeps): Promise<number> {
  if (deps.remainingMoney) return deps.remainingMoney(userId);
  return findRemainingMoney(userId, deps.now ? { now: deps.now } : {});
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
  const productive = open
    .filter((debt) => !isConsumerDebt(debt))
    .map(({ id, kind, name, remaining, monthlyInstalment }) => ({
      id,
      kind,
      name,
      remaining,
      monthlyInstalment,
    }));
  const chosen = simulate(consumer, body.method, body.extraPayment);
  const other = simulate(consumer, otherOf(body.method), body.extraPayment);
  const hasRate = consumer.some((debt) => debt.annualInterestRate !== null);
  const monthOf = (months: number | null) =>
    months === null ? null : addMonths(today, months - 1).slice(0, 7);

  return {
    method: body.method,
    extraPayment: body.extraPayment,
    maxExtraPayment,
    monthlyBudget:
      consumer.reduce((sum, debt) => sum + debt.monthlyInstalment, 0) + body.extraPayment,
    hasUnknownRate: consumer.some((debt) => debt.annualInterestRate === null),
    accounts: chosen.accounts.map((account) => ({
      ...account,
      payoffMonth: monthOf(account.months),
    })),
    productive,
    totalInterest: chosen.totalInterest,
    allPaidMonths: chosen.allPaidMonths,
    allPaidMonth: monthOf(chosen.allPaidMonths),
    comparison: consumer.length > 0 ? comparisonOf(chosen, other, body.method, hasRate) : null,
  };
}
