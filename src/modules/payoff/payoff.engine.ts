/**
 * The payoff engine of Rencana Pelunasan (SKR-03): the order a plan pays consumer debts in, the
 * month each account is paid off and the interest it costs, for snowball or avalanche. Pure and
 * deterministic; no AI ever computes a date or an amount here.
 *
 * Each month the plan pays one budget: every open account's instalment plus the extra payment.
 * When an account is paid off its instalment is not freed for spending, it rolls to the next
 * account in the plan's order, which is how both methods finish early.
 */

import { MAX_PAYOFF_MONTHS, PAYOFF_METHOD } from '../../lib/constants/payoff.ts';
import type { DEBT_KIND } from '../../lib/constants/profile.ts';

type Values<T> = T[keyof T];
export type PayoffMethod = Values<typeof PAYOFF_METHOD>;

/** An open consumer-debt account as the plan reads it. */
export type PayoffDebt = {
  id: string;
  kind: Values<typeof DEBT_KIND>;
  name: string;
  remaining: number;
  monthlyInstalment: number;
  /** Percent per year; null when the person has not said, which the plan counts as 0. */
  annualInterestRate: number | null;
  dueDay: number | null;
};

/** An account in the plan's order, with what the simulation found. */
type SimulatedAccount = PayoffDebt & {
  /** 1 for the account the plan pays first. */
  position: number;
  /** The month it is paid off, counted from this month as 1; null when it never is in time. */
  months: number | null;
  /** The interest it costs until then, in whole rupiah; null when it is never paid off. */
  interest: number | null;
};

export type Simulation = {
  accounts: SimulatedAccount[];
  /** The interest of every account together; null unless all of them are paid off. */
  totalInterest: number | null;
  /** The month the last account is paid off; null unless all of them are. */
  allPaidMonths: number | null;
};

/** A balance under half a rupiah counts as paid: the interest is computed in fractions. */
const SETTLED = 0.5;

const rateOf = (debt: PayoffDebt) => debt.annualInterestRate ?? 0;
const smallestFirst = (a: PayoffDebt, b: PayoffDebt) => a.remaining - b.remaining;
const dearestFirst = (a: PayoffDebt, b: PayoffDebt) => rateOf(b) - rateOf(a);

/** The order a method pays in; a tie keeps the order the accounts were added in. */
export function payoffOrder(debts: PayoffDebt[], method: PayoffMethod): PayoffDebt[] {
  const compare =
    method === PAYOFF_METHOD.snowball
      ? (a: PayoffDebt, b: PayoffDebt) => smallestFirst(a, b) || dearestFirst(a, b)
      : (a: PayoffDebt, b: PayoffDebt) => dearestFirst(a, b) || smallestFirst(a, b);
  return debts.toSorted(compare);
}

/** Pays `amount` towards the open balances in order; what no account can take is dropped. */
function payInOrder(balances: number[], amount: number): void {
  let left = amount;
  for (let index = 0; index < balances.length && left > 0; index += 1) {
    const balance = balances[index] ?? 0;
    if (balance > SETTLED) {
      const paid = Math.min(left, balance);
      balances[index] = balance - paid;
      left -= paid;
    }
  }
}

export function simulate(
  debts: PayoffDebt[],
  method: PayoffMethod,
  extraPayment: number,
): Simulation {
  const order = payoffOrder(debts, method);
  const balances = order.map((debt) => debt.remaining);
  const months: (number | null)[] = order.map(() => null);
  const interest = order.map(() => 0);
  const budget = order.reduce((sum, debt) => sum + debt.monthlyInstalment, 0) + extraPayment;

  for (let month = 1; month <= MAX_PAYOFF_MONTHS && months.includes(null); month += 1) {
    order.forEach((debt, index) => {
      const balance = balances[index] ?? 0;
      const charge = balance > SETTLED ? (balance * rateOf(debt)) / 1200 : 0;
      balances[index] = balance + charge;
      interest[index] = (interest[index] ?? 0) + charge;
    });
    /** Every open account gets its own instalment first (never more than it owes). */
    let spent = 0;
    order.forEach((debt, index) => {
      const balance = balances[index] ?? 0;
      const paid = balance > SETTLED ? Math.min(debt.monthlyInstalment, balance) : 0;
      balances[index] = balance - paid;
      spent += paid;
    });
    /** What is left of the budget goes to the first account still open, then the next. */
    payInOrder(balances, budget - spent);
    balances.forEach((balance, index) => {
      if (months[index] === null && balance <= SETTLED) months[index] = month;
    });
  }

  const accounts = order.map((debt, index): SimulatedAccount => {
    const paidIn = months[index] ?? null;
    return Object.assign({}, debt, {
      position: index + 1,
      months: paidIn,
      interest: paidIn === null ? null : Math.round(interest[index] ?? 0),
    });
  });
  const allPaid = accounts.length > 0 && accounts.every((account) => account.months !== null);
  return {
    accounts,
    totalInterest: allPaid
      ? accounts.reduce((sum, account) => sum + (account.interest ?? 0), 0)
      : null,
    allPaidMonths: allPaid ? Math.max(0, ...accounts.map((account) => account.months ?? 0)) : null,
  };
}
