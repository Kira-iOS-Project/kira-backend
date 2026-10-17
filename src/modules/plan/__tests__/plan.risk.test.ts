/**
 * Kenali Profil Risikomu's table (the coordinator's decision, lib/constants/risk.ts): each answer
 * arrives as the board's display index and scores by its own question's row, 5–10 Konservatif,
 * 11–15 Moderat, 16–20 Agresif, then question 3's horizon caps it.
 */

import { describe, expect, test } from 'bun:test';
import { RISK_PROFILE } from '../../../lib/constants/plan.ts';
import { findRiskProfile, getRiskProfile, profileOf, saveRiskProfile } from '../plan.risk.ts';
import type { RiskRepository } from '../plan.risk.repository.ts';

const { conservative, moderate, aggressive } = RISK_PROFILE;
const AT = new Date('2026-10-17T05:00:00.000Z');

describe('profileOf', () => {
  test("the boards' own answers are Moderat, as HasilRisiko shows (3+3+2+1+2 = 11)", () => {
    /** By position alone this would total 9, Konservatif: the per-question rows matter. */
    expect(profileOf([1, 1, 1, 0, 1])).toBe(moderate);
  });

  test('the most cautious answers, and Belum Tahu, total 5: Konservatif', () => {
    expect(profileOf([3, 3, 0, 0, 0])).toBe(conservative);
  });

  test('the most risk-tolerant answers total 20: Agresif', () => {
    expect(profileOf([2, 2, 3, 3, 3])).toBe(aggressive);
  });

  test('the boundaries: 10 Konservatif, 11 Moderat, 15 Moderat, 16 Agresif', () => {
    /** Question 3 at "3 sampai 5 Tahun" (3 points) or more, so no cap applies. */
    /** 1+1+3+1+4 = 10 */
    expect(profileOf([3, 3, 2, 0, 3])).toBe(conservative);
    /** 2+1+3+1+4 = 11 */
    expect(profileOf([0, 3, 2, 0, 3])).toBe(moderate);
    /** 4+4+3+1+2 = 14 */
    expect(profileOf([2, 2, 2, 0, 1])).toBe(moderate);
    /** 4+4+3+1+3 = 15 */
    expect(profileOf([2, 2, 2, 0, 2])).toBe(moderate);
    /** 4+4+3+2+3 = 16 */
    expect(profileOf([2, 2, 2, 1, 2])).toBe(aggressive);
  });

  test('money needed within a year caps at Konservatif; 1 to 3 years at Moderat', () => {
    /** 17 before the cap */
    expect(profileOf([2, 2, 0, 3, 3])).toBe(conservative);
    /** 18 before the cap */
    expect(profileOf([2, 2, 1, 3, 3])).toBe(moderate);
    /** 2+2+2+1+1 = 8: under the cap already */
    expect(profileOf([0, 0, 1, 0, 0])).toBe(conservative);
  });
});

function repositoryOf(stored: Awaited<ReturnType<RiskRepository['find']>>) {
  const saved: unknown[] = [];
  const repository: RiskRepository = {
    find: async () => stored,
    save: async (_userId, answers, profile) => {
      saved.push([answers, profile]);
      return { answers, profile, updatedAt: AT };
    },
  };
  return { repository, saved };
}

describe('saving and reading the profile', () => {
  test('saves the answers with the profile the table gives them', async () => {
    const { repository, saved } = repositoryOf(null);
    const view = await saveRiskProfile('user-1', [1, 1, 1, 0, 1], { repository });

    expect(view).toEqual({
      profile: moderate,
      answers: [1, 1, 1, 0, 1],
      updatedAt: AT.toISOString(),
    });
    expect(saved).toEqual([[[1, 1, 1, 0, 1], moderate]]);
  });

  test('reads every field null before the quiz, the stored one after', async () => {
    const none = repositoryOf(null);
    expect(await getRiskProfile('user-1', none)).toEqual({
      profile: null,
      answers: null,
      updatedAt: null,
    });
    expect(await findRiskProfile('user-1', none)).toBeNull();

    const taken = repositoryOf({ answers: [2, 2, 3, 3, 3], profile: aggressive, updatedAt: AT });
    expect((await getRiskProfile('user-1', taken)).profile).toBe(aggressive);
    expect(await findRiskProfile('user-1', taken)).toBe(aggressive);
  });
});
