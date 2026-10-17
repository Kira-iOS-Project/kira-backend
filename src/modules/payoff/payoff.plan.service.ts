/**
 * Rencanaku's plan: committing to a method (Jadikan Rencanaku), reading the active plan, and moving
 * its focus to another account. A person has one active plan; a new one ends the old.
 */

import { PAYOFF_METHOD } from '../../lib/constants/payoff.ts';
import { wibDate } from '../../lib/time/wib.ts';
import {
  PayoffDebtNotFoundError,
  PayoffExtraTooHighError,
  PayoffNothingToPlanError,
  PayoffPlanNotFoundError,
} from './payoff.errors.ts';
import { planRepository, type PlanRepository } from './payoff.plan.repository.ts';
import type { ActivePlan, CreatePlanBody } from './payoff.plan.schema.ts';
import { orderedConsumer, planView } from './payoff.plan.view.ts';
import { remainingOf, type PayoffDeps } from './payoff.service.ts';

export type PlanDeps = Omit<PayoffDeps, 'repository'> & { repository?: PlanRepository };

const clock = (deps: PlanDeps) => (deps.now ?? (() => new Date()))();

export async function createPlan(
  userId: string,
  body: CreatePlanBody,
  deps: PlanDeps = {},
): Promise<ActivePlan> {
  const repository = deps.repository ?? planRepository;
  const now = clock(deps);
  const [debts, maxExtraPayment] = await Promise.all([
    repository.listDebts(userId),
    remainingOf(userId, deps),
  ]);
  if (body.extraPayment > maxExtraPayment) throw new PayoffExtraTooHighError();
  const [focus] = orderedConsumer(debts, body.method, null);
  if (!focus) throw new PayoffNothingToPlanError();
  const plan = await repository.createPlan(
    userId,
    { method: body.method, extraPayment: body.extraPayment, focusDebtId: focus.id },
    now,
  );
  return planView(plan, debts, wibDate(now));
}

export async function getActivePlan(userId: string, deps: PlanDeps = {}): Promise<ActivePlan> {
  const repository = deps.repository ?? planRepository;
  const today = wibDate(clock(deps));
  const [plan, debts] = await Promise.all([
    repository.findActive(userId),
    repository.listDebts(userId),
  ]);
  if (!plan) throw new PayoffPlanNotFoundError();
  return planView(plan, debts, today, await repository.listPaidSince(userId, plan.createdAt));
}

/** "Lanjut ke Paylater B": the plan's focus moves to another open consumer account. */
export async function setPlanFocus(
  userId: string,
  focusDebtId: string,
  deps: PlanDeps = {},
): Promise<ActivePlan> {
  const repository = deps.repository ?? planRepository;
  const today = wibDate(clock(deps));
  const [plan, debts] = await Promise.all([
    repository.findActive(userId),
    repository.listDebts(userId),
  ]);
  if (!plan) throw new PayoffPlanNotFoundError();
  if (!orderedConsumer(debts, plan.method, null).some((debt) => debt.id === focusDebtId)) {
    throw new PayoffDebtNotFoundError();
  }
  await repository.setFocus(plan.id, focusDebtId);
  const paid = await repository.listPaidSince(userId, plan.createdAt);
  return planView({ ...plan, focusDebtId }, debts, today, paid);
}

/**
 * The account being paid off now, for Rencana's first rung ("Sedang Berjalan · Paylater A"): the
 * plan's, or without a plan the smallest consumer debt ("Mulai dari sisa yang paling kecil").
 */
export async function payingNowOf(
  userId: string,
  deps: Pick<PlanDeps, 'repository'> = {},
): Promise<{ id: string; name: string } | null> {
  const repository = deps.repository ?? planRepository;
  const [plan, debts] = await Promise.all([
    repository.findActive(userId),
    repository.listDebts(userId),
  ]);
  const method = plan?.method ?? PAYOFF_METHOD.snowball;
  const [first] = orderedConsumer(debts, method, plan?.focusDebtId ?? null);
  return first ? { id: first.id, name: first.name } : null;
}
