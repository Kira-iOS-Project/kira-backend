import { describe, expect, test } from 'bun:test';
import { goalExportSections } from '../plan.export.ts';
import { createGoalRepositoryMock, DEPOSIT_ID, GOAL_ID, goalRow } from './helpers.ts';

describe('goalExportSections', () => {
  test('nothing to export gives no section', async () => {
    const repository = createGoalRepositoryMock({ listGoals: async () => [] });
    expect(await goalExportSections('user-1', { repository })).toEqual([]);
  });

  test('exports the goals and their deposits in words', async () => {
    const repository = createGoalRepositoryMock({
      listGoals: async () => [goalRow({ inBudget: true })],
      listAllDeposits: async () => [
        {
          id: DEPOSIT_ID,
          goalId: GOAL_ID,
          amount: 650_000,
          depositedOn: '2026-09-25',
          goalName: 'Dana Darurat',
        },
      ],
    });
    const [goals, deposits] = await goalExportSections('user-1', { repository });
    expect(goals?.title).toBe('Rencana · Tujuan');
    expect(goals?.rows).toEqual([
      [
        'Dana Darurat',
        'Dana Darurat',
        '25200000',
        '2029-04-25',
        '650000',
        '4800000',
        '4800000',
        'Ya',
      ],
    ]);
    expect(deposits?.rows).toEqual([['Dana Darurat', '2026-09-25', '650000']]);
  });
});
