/**
 * Kenali Profil Risikomu (REN-06, REN-07): the five answers become a profile through the table in
 * lib/constants/risk.ts, then are stored with it. Deterministic; AI never decides the profile.
 */

import {
  AGGRESSIVE_FROM,
  CONSERVATIVE_UP_TO,
  RISK_ANSWER_POINTS,
  RISK_HORIZON_CAPS,
  RISK_HORIZON_QUESTION,
} from '../../lib/constants/risk.ts';
import { RISK_PROFILE } from '../../lib/constants/plan.ts';
import type { RiskProfileView } from './plan.schema.ts';
import {
  riskRepository,
  type RiskProfileKey,
  type RiskRepository,
  type StoredRiskProfile,
} from './plan.risk.repository.ts';

export type RiskDeps = { repository?: RiskRepository };

/** The profiles from the most cautious, for the horizon cap. */
const ORDER = [RISK_PROFILE.conservative, RISK_PROFILE.moderate, RISK_PROFILE.aggressive];

/**
 * The profile of five answers (each 0–3, already validated): 1–4 points each, Konservatif up to
 * CONSERVATIVE_UP_TO, Agresif from AGGRESSIVE_FROM, Moderat between; then question 3's horizon caps
 * it (RISK_HORIZON_CAPS).
 */
export function profileOf(answers: readonly number[]): RiskProfileKey {
  const total = answers.reduce(
    (sum, answer, index) => sum + (RISK_ANSWER_POINTS[index]?.[answer] ?? 0),
    0,
  );
  const scored =
    total <= CONSERVATIVE_UP_TO
      ? RISK_PROFILE.conservative
      : total >= AGGRESSIVE_FROM
        ? RISK_PROFILE.aggressive
        : RISK_PROFILE.moderate;
  const cap = RISK_HORIZON_CAPS[answers[RISK_HORIZON_QUESTION] ?? -1];
  if (cap === undefined) return scored;
  return ORDER.indexOf(scored) > ORDER.indexOf(cap) ? cap : scored;
}

const viewOf = (row: StoredRiskProfile): RiskProfileView => ({
  profile: row.profile,
  answers: row.answers,
  updatedAt: row.updatedAt.toISOString(),
});

/** Lihat Hasil: the profile is computed here and stored with the answers, replacing an earlier one. */
export async function saveRiskProfile(
  userId: string,
  answers: number[],
  deps: RiskDeps = {},
): Promise<RiskProfileView> {
  const repository = deps.repository ?? riskRepository;
  return viewOf(await repository.save(userId, answers, profileOf(answers)));
}

/** Ulangi Kuis opens with the earlier answers; every field null before the first quiz. */
export async function getRiskProfile(
  userId: string,
  deps: RiskDeps = {},
): Promise<RiskProfileView> {
  const row = await (deps.repository ?? riskRepository).find(userId);
  return row ? viewOf(row) : { profile: null, answers: null, updatedAt: null };
}

/** The profile alone for GET /plan, or null before the quiz. */
export async function findRiskProfile(
  userId: string,
  deps: RiskDeps = {},
): Promise<RiskProfileKey | null> {
  return (await (deps.repository ?? riskRepository).find(userId))?.profile ?? null;
}
