/**
 * Rencana's screen (REN-01): Tangga Keuanganmu and the calculators' prefill from the score's
 * answers (plan.ladder.ts), the goals, and the risk profile, read together.
 */

import { listGoalSummaries } from './plan.goal.service.ts';
import { ladderOf, prefillOf } from './plan.ladder.ts';
import { findRiskProfile } from './plan.risk.ts';
import type { Plan } from './plan.schema.ts';

export async function getPlan(userId: string): Promise<Plan> {
  const [ladder, goals, riskProfile, prefill] = await Promise.all([
    ladderOf(userId),
    listGoalSummaries(userId),
    findRiskProfile(userId),
    prefillOf(userId),
  ]);
  return { ladder, goals, riskProfile, prefill };
}
