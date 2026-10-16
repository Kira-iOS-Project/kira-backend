/**
 * The plan a person is on and what they have used of it this quota period (CAT-05, CAT-09). The
 * chat and bank-import modules read it before spending a quota or opening a Kira Plus feature.
 */

import { PLAN_TERMS } from '../../lib/constants/plans.ts';
import { wibDate } from '../../lib/time/wib.ts';
import {
  type ActivePlan,
  activePlanOf,
  type QuotaPeriod,
  quotaPeriod,
  type Usage,
  usageOf,
} from '../../lib/usage/plan-usage.ts';
import { PlanFeatureUnavailableError } from './usage.errors.ts';
import { type UsageRepository, usageRepository } from './usage.repository.ts';

export type PlanUsage = { plan: ActivePlan; period: QuotaPeriod; usage: Usage };

type UsageDeps = { repository?: UsageRepository; now?: () => Date };

export async function currentPlanUsage(userId: string, deps: UsageDeps = {}): Promise<PlanUsage> {
  const repository = deps.repository ?? usageRepository;
  const today = wibDate(deps.now?.() ?? new Date());
  const plan = activePlanOf(await repository.findActiveSubscriptions(userId));
  const period = quotaPeriod(plan.subscription, today);
  const counters = await repository.findCounters(userId, period.start);
  return { plan, period, usage: usageOf(counters, plan.id, period.resetsOn) };
}

export async function getUsage(userId: string, deps: UsageDeps = {}): Promise<Usage> {
  return (await currentPlanUsage(userId, deps)).usage;
}

/** Refuses voice input and bank imports outside Kira Plus. */
export function requireVoiceAndImport(plan: ActivePlan, feature: string): void {
  if (!PLAN_TERMS[plan.id].voiceAndImport) throw new PlanFeatureUnavailableError(feature);
}
