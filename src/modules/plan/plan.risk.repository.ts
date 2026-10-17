/**
 * Kenali Profil Risikomu's data access (AGENTS.md Rules 4 and 10): the person's answers and the
 * profile made of them, one row each; retaking the quiz replaces it.
 */

import { eq } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { db } from '../../db/client/index.ts';
import { riskProfiles } from '../../db/schema/schema.ts';
import type { RISK_PROFILE } from '../../lib/constants/plan.ts';

export type RiskProfileKey = (typeof RISK_PROFILE)[keyof typeof RISK_PROFILE];

export type StoredRiskProfile = {
  answers: number[];
  profile: RiskProfileKey;
  updatedAt: Date;
};

export type RiskRepository = {
  find(userId: string): Promise<StoredRiskProfile | null>;
  /** Stores the answers and the profile, replacing an earlier quiz. */
  save(userId: string, answers: number[], profile: RiskProfileKey): Promise<StoredRiskProfile>;
};

const columns = {
  answers: riskProfiles.answers,
  profile: riskProfiles.profile,
  updatedAt: riskProfiles.updatedAt,
};

export function createRiskRepository(client: PostgresJsDatabase = db): RiskRepository {
  return {
    async find(userId) {
      const [row] = await client
        .select(columns)
        .from(riskProfiles)
        .where(eq(riskProfiles.userId, userId))
        .limit(1);
      return row ?? null;
    },

    async save(userId, answers, profile) {
      const [row] = await client
        .insert(riskProfiles)
        .values({ userId, answers, profile })
        .onConflictDoUpdate({
          target: riskProfiles.userId,
          set: { answers, profile, updatedAt: new Date() },
        })
        .returning(columns);
      if (row === undefined) throw new Error('The risk profile was not stored');
      return row;
    },
  };
}

export const riskRepository = createRiskRepository();
