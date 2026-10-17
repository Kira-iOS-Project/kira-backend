/**
 * What Rencanaku shows, built from the stored plan and the open accounts: the consumer accounts in
 * the plan's order with the one being paid off first, each account's progress and tag, and the
 * next payment. Pure; the clock arrives as `today`.
 */

import { PAYOFF_ACCOUNT_STATUS } from '../../lib/constants/payoff.ts';
import { isConsumerDebt } from '../score/index.ts';
import { addMonths, daysBetween, daysInMonth, monthStart } from '../../lib/time/wib.ts';
import {
  payoffOrder,
  simulateInOrder,
  type PayoffDebt,
  type PayoffMethod,
} from './payoff.engine.ts';
import type { PlanDebt, StoredPlan } from './payoff.plan.repository.ts';
import type { ActivePlan } from './payoff.plan.schema.ts';

/** The consumer accounts, the one to pay first leading and the rest in the plan's order. */
export function orderedConsumer<T extends PayoffDebt>(
  debts: T[],
  method: PayoffMethod,
  focusDebtId: string | null,
) {
  const order = payoffOrder(debts.filter(isConsumerDebt), method);
  const focus = order.find((debt) => debt.id === focusDebtId) ?? order[0];
  return focus ? [focus, ...order.filter((debt) => debt.id !== focus.id)] : [];
}

/** The next time the day of the month comes round, today included. */
function dueDateOf(today: string, dueDay: number): string {
  const thisMonth = monthStart(today);
  const [year = 0, month = 1] = thisMonth.split('-').map(Number);
  const day = (date: string, y: number, m: number) =>
    `${date.slice(0, 8)}${String(Math.min(dueDay, daysInMonth(y, m))).padStart(2, '0')}`;
  const candidate = day(thisMonth, year, month);
  if (candidate >= today) return candidate;
  const next = addMonths(thisMonth, 1);
  const [nextYear = 0, nextMonth = 1] = next.split('-').map(Number);
  return day(next, nextYear, nextMonth);
}

/**
 * The due date of the `months`-th payment from today (`YYYY-MM-DD`), the first being the next time
 * `dueDay` comes round; null without a due day or a month.
 */
export function paymentDate(today: string, dueDay: number | null, months: number | null) {
  if (dueDay === null || months === null) return null;
  const month = addMonths(monthStart(dueDateOf(today, dueDay)), months - 1);
  const [year = 0, monthNumber = 1] = month.split('-').map(Number);
  const day = Math.min(dueDay, daysInMonth(year, monthNumber));
  return `${month.slice(0, 8)}${String(day).padStart(2, '0')}`;
}

/** The month of that payment (`YYYY-MM`); counted from this month when there is no due day. */
export function paymentMonth(today: string, dueDay: number | null, months: number | null) {
  if (months === null) return null;
  return (paymentDate(today, dueDay, months) ?? addMonths(today, months - 1)).slice(0, 7);
}

export function progressOf(debt: { original: number; remaining: number }): number {
  if (debt.original <= 0) return 0;
  return Math.round(((debt.original - debt.remaining) * 100) / debt.original);
}

/** The first consumer account is being paid off, the second is next, the rest carry on. */
function statusOf(index: number) {
  if (index === 0) return PAYOFF_ACCOUNT_STATUS.inProgress;
  return index === 1 ? PAYOFF_ACCOUNT_STATUS.next : PAYOFF_ACCOUNT_STATUS.ongoing;
}

export function planView(plan: StoredPlan, debts: PlanDebt[], today: string): ActivePlan {
  const consumer = orderedConsumer(debts, plan.method, plan.focusDebtId);
  const productive = debts.filter((debt) => !isConsumerDebt(debt));
  /** The plan's order with its extra; a Jalan terus debt alone, on its own instalment. */
  const months = new Map<string, number | null>();
  for (const account of simulateInOrder(consumer, plan.extraPayment).accounts) {
    months.set(account.id, account.months);
  }
  for (const debt of productive)
    months.set(debt.id, simulateInOrder([debt], 0).accounts[0]?.months ?? null);
  const focusMonths = consumer[0] ? months.get(consumer[0].id) : null;
  const accounts = [...consumer, ...productive].map((debt, index) => ({
    id: debt.id,
    kind: debt.kind,
    name: debt.name,
    remaining: debt.remaining,
    original: debt.original,
    progressPercent: progressOf(debt),
    monthlyInstalment: debt.monthlyInstalment,
    annualInterestRate: debt.annualInterestRate,
    dueDay: debt.dueDay,
    status: index < consumer.length ? statusOf(index) : PAYOFF_ACCOUNT_STATUS.ongoing,
    payoffMonth: paymentMonth(today, debt.dueDay, months.get(debt.id) ?? null),
    payoffDate: paymentDate(today, debt.dueDay, months.get(debt.id) ?? null),
    startMonth:
      index === 1 && index < consumer.length && focusMonths
        ? paymentMonth(today, consumer[0]?.dueDay ?? null, focusMonths + 1)
        : null,
  }));
  const [focus] = consumer;
  const dueDate = focus?.dueDay ? dueDateOf(today, focus.dueDay) : null;
  /** The extra goes to the account being paid off, on top of its instalment (board SKR-04). */
  const instalment = focus ? Math.min(focus.monthlyInstalment, focus.remaining) : 0;
  const extra = focus ? Math.min(plan.extraPayment, focus.remaining - instalment) : 0;
  return {
    id: plan.id,
    method: plan.method,
    extraPayment: plan.extraPayment,
    startedAt: plan.createdAt.toISOString(),
    accounts,
    nextPayment: focus
      ? {
          debtId: focus.id,
          name: focus.name,
          amount: instalment + extra,
          instalment,
          extra,
          dueDate,
          daysLeft: dueDate === null ? null : daysBetween(today, dueDate),
        }
      : null,
  };
}
