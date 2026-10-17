/**
 * Kenali Profil Risikomu (kira-project-41 builds it): the five answers, the profile the server's
 * fixed table gives them, and the saved result. Until then nothing is stored.
 */

import type { RISK_PROFILE } from '../../lib/constants/plan.ts';
import type { RiskProfileView } from './plan.schema.ts';

type Profile = (typeof RISK_PROFILE)[keyof typeof RISK_PROFILE];

const NONE: RiskProfileView = { profile: null, answers: null, updatedAt: null };

export async function saveRiskProfile(
  _userId: string,
  _answers: number[],
): Promise<RiskProfileView> {
  return NONE;
}

export async function getRiskProfile(_userId: string): Promise<RiskProfileView> {
  return NONE;
}

export async function findRiskProfile(_userId: string): Promise<Profile | null> {
  return null;
}
