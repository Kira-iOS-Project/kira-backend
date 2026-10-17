/**
 * "Tandai Sudah Bayar": a payment against one debt account. The payment that settles an account is
 * the paid-off event (Perayaan Lunas): the response says so once, with the score the engine
 * expects and the account the plan moves to next.
 */

import {
  estimateScoreChange,
  isConsumerDebt,
  type DebtInput,
  type ScoreEstimate,
} from '../score/index.ts';
import { PayoffDebtNotFoundError, PayoffPaymentTooHighError } from './payoff.errors.ts';
import { planRepository, type PlanDebt } from './payoff.plan.repository.ts';
import type { PaymentResult } from './payoff.plan.schema.ts';
import { orderedConsumer, progressOf } from './payoff.plan.view.ts';
import type { PlanDeps } from './payoff.plan.service.ts';

export type PaymentDeps = PlanDeps & {
  estimateScore?: (userId: string, paid: DebtInput) => Promise<ScoreEstimate | null>;
};

/** The account the plan pays next: the first other open consumer account in its order. */
async function nextAccountOf(
  userId: string,
  paidId: string,
  repository: NonNullable<PlanDeps['repository']>,
) {
  const [plan, debts] = await Promise.all([
    repository.findActive(userId),
    repository.listDebts(userId),
  ]);
  if (!plan) return null;
  const next = orderedConsumer(debts, plan.method, null).find((debt) => debt.id !== paidId);
  return next ? { id: next.id, name: next.name } : null;
}

const inputOf = (debt: PlanDebt): DebtInput => ({
  kind: debt.kind,
  name: debt.name,
  remaining: debt.remaining,
  monthlyInstalment: debt.monthlyInstalment,
  paymentStatus: debt.paymentStatus,
});

export async function recordPayment(
  userId: string,
  debtId: string,
  amount: number,
  deps: PaymentDeps = {},
): Promise<PaymentResult> {
  const repository = deps.repository ?? planRepository;
  const now = (deps.now ?? (() => new Date()))();
  const debt = await repository.findDebt(userId, debtId);
  if (!debt) throw new PayoffDebtNotFoundError();
  if (amount > debt.remaining) throw new PayoffPaymentTooHighError();
  const remaining = debt.remaining - amount;
  const applied = await repository.recordPayment(
    userId,
    debtId,
    { amount, from: debt.remaining, to: remaining },
    now,
  );
  if (!applied) throw new PayoffPaymentTooHighError();
  const paidOff = remaining === 0;
  const estimate = deps.estimateScore ?? estimateScoreChange;
  return {
    debtId,
    paid: amount,
    remaining,
    progressPercent: progressOf({ original: debt.original, remaining }),
    paidOff,
    nextAccount: paidOff ? await nextAccountOf(userId, debtId, repository) : null,
    scoreEstimate: paidOff && isConsumerDebt(debt) ? await estimate(userId, inputOf(debt)) : null,
  };
}
