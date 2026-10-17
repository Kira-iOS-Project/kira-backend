import { describe, expect, test } from 'bun:test';
import { findRiskProfile, getRiskProfile, saveRiskProfile } from '../plan.risk.ts';

describe('the risk profile before it is stored', () => {
  test('answers nothing', async () => {
    const none = { profile: null, answers: null, updatedAt: null };
    expect(await saveRiskProfile('user-1', [0, 1, 2, 3, 0])).toEqual(none);
    expect(await getRiskProfile('user-1')).toEqual(none);
    expect(await findRiskProfile('user-1')).toBeNull();
  });
});
