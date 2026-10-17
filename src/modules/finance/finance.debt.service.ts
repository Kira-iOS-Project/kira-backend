/**
 * Detail Utang (UNG-03): one debt account read with its payments, the next due date from the payoff
 * module's calendar, its place in the payoff order, and what clearing it now is worth to the Kira
 * Score. The engines are the payoff and score modules'; this only puts their numbers together.
 */

import { PayoffDebtNotFoundError, paymentDate, priorityOf } from '../payoff/index.ts';
import { estimatePayingOff } from '../score/index.ts';
import { wibDate } from '../../lib/time/wib.ts';
import type { DebtDetail } from './finance.debt.schema.ts';
import {
  debtDetailRepository,
  type DebtAccountRow,
  type DebtDetailRepository,
  type DebtPaymentRow,
} from './finance.repository.debt.ts';

type Deps = {
  repository?: DebtDetailRepository;
  now?: () => Date;
  priority?: typeof priorityOf;
  estimate?: typeof estimatePayingOff;
};

/** Paid on or before the due day of the month it was paid in; always on time without a due day. */
function onTimeOf(paidOn: string, dueDay: number | null): boolean {
  return dueDay === null || Number(paidOn.slice(8, 10)) <= dueDay;
}

function paymentsOf(rows: DebtPaymentRow[], dueDay: number | null): DebtDetail['payments'] {
  return rows.map((row, index) => {
    const paidOn = wibDate(row.paidAt);
    return {
      id: row.id,
      number: rows.length - index,
      amount: row.amount,
      paidOn,
      onTime: onTimeOf(paidOn, dueDay),
    };
  });
}

/** Instalments left at the monthly amount, the last one partial. */
function instalmentsLeft(debt: DebtAccountRow): number {
  return debt.monthlyInstalment > 0 ? Math.ceil(debt.remainingAmount / debt.monthlyInstalment) : 0;
}

async function nextStepOf(
  userId: string,
  debt: DebtAccountRow,
  dueDate: string | null,
  deps: Required<Pick<Deps, 'priority' | 'estimate'>>,
): Promise<DebtDetail['nextStep']> {
  const extraAmount = debt.remainingAmount - debt.monthlyInstalment;
  if (extraAmount <= 0) return null;
  const priority = await deps.priority(userId, debt.id);
  if (!priority) return null;
  const score = await deps.estimate(userId, {
    kind: debt.kind,
    name: debt.name,
    remaining: debt.remainingAmount,
    monthlyInstalment: debt.monthlyInstalment,
    paymentStatus: debt.paymentStatus,
  });
  return {
    priority: priority.rank,
    priorityOf: priority.of,
    extraAmount,
    payOn: dueDate,
    monthsEarlier: Math.max(0, instalmentsLeft(debt) - 1),
    scoreBefore: score?.before ?? null,
    scoreAfter: score?.after ?? null,
  };
}

export async function getDebtDetail(
  userId: string,
  debtId: string,
  deps: Deps = {},
): Promise<DebtDetail> {
  const repository = deps.repository ?? debtDetailRepository;
  const today = wibDate((deps.now ?? (() => new Date()))());
  const debt = await repository.findDebt(userId, debtId);
  if (!debt) throw new PayoffDebtNotFoundError();
  const rows = await repository.listPayments(userId, debtId);
  const dueDate = paymentDate(today, debt.dueDay, 1);
  const tenorKnown = debt.remainingTenorMonths !== null;
  return {
    id: debt.id,
    name: debt.name,
    kind: debt.kind,
    remaining: debt.remainingAmount,
    totalAmount: debt.originalAmount,
    paidAmount: Math.max(0, debt.originalAmount - debt.remainingAmount),
    instalmentsPaid: tenorKnown ? rows.length : null,
    instalmentsTotal: tenorKnown ? rows.length + (debt.remainingTenorMonths ?? 0) : null,
    monthlyInstalment: debt.monthlyInstalment,
    dueDate,
    payments: paymentsOf(rows, debt.dueDay),
    nextStep: await nextStepOf(userId, debt, dueDate, {
      priority: deps.priority ?? priorityOf,
      estimate: deps.estimate ?? estimatePayingOff,
    }),
  };
}
