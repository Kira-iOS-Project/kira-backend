import { describe, expect, test } from 'bun:test';
import { DEBT_KIND, FOCUS } from '../../../lib/constants/profile.ts';
import { estimateDebtPayoffScore, findScoreInput } from '../score.service.ts';
import { createScoreRepositoryMock, debt } from './helpers.ts';

describe('estimateDebtPayoffScore', () => {
  test('compares the score with the selected debt open and paid off without writing a snapshot', async () => {
    const selected = { ...debt(), id: 'selected-debt' };
    const other = {
      ...debt({ kind: DEBT_KIND.vehicle, name: 'Cicilan Motor', remaining: 13_000_000 }),
      id: 'other-debt',
    };
    const repository = createScoreRepositoryMock({ listOpenDebts: async () => [selected, other] });

    await expect(
      estimateDebtPayoffScore('user-1', 'selected-debt', { repository }),
    ).resolves.toEqual({ current: 75, afterPayoff: 79, isSimulated: true });
  });

  test('returns null before the health check', async () => {
    const repository = createScoreRepositoryMock({
      findState: async () => ({
        focus: FOCUS.trackSpending,
        payday: { day: 25, endOfMonth: false },
        input: null,
      }),
    });
    await expect(
      estimateDebtPayoffScore('user-1', 'selected-debt', { repository }),
    ).resolves.toBeNull();
  });
});

describe('findScoreInput', () => {
  test('returns the answers with open debts, and null without the health check', async () => {
    const repository = createScoreRepositoryMock();
    const input = await findScoreInput('user-1', { repository });
    expect(input?.income).toBeGreaterThan(0);
    expect(Array.isArray(input?.debts)).toBe(true);

    const none = createScoreRepositoryMock({ findState: async () => null });
    expect(await findScoreInput('user-1', { repository: none })).toBeNull();
    expect(await findScoreInput('user-1')).toBeNull();
  });
});
