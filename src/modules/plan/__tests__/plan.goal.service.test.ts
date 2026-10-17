import { describe, expect, test } from 'bun:test';
import { EMERGENCY_MILESTONE, GOAL_KIND } from '../../../lib/constants/plan.ts';
import {
  addGoalDeposit,
  createGoal,
  getGoalDetail,
  listGoalSummaries,
  milestonesOf,
  updateGoal,
} from '../plan.goal.service.ts';
import { createGoalRepositoryMock, DEPOSIT_ID, GOAL_ID, goalRow } from './helpers.ts';

const USER = 'user-1';

describe('milestonesOf', () => {
  test("reads Dinda's board: 1 minggu and 1 bulan reached when the goal was made, 3× and 6× ahead", () => {
    expect(milestonesOf(goalRow(), [])).toEqual([
      { key: EMERGENCY_MILESTONE.oneWeek, amount: 980_000, reachedOn: '2026-07-01' },
      { key: EMERGENCY_MILESTONE.oneMonth, amount: 4_200_000, reachedOn: '2026-07-01' },
      { key: EMERGENCY_MILESTONE.threeMonths, amount: 12_600_000, reachedOn: null },
      { key: EMERGENCY_MILESTONE.target, amount: 25_200_000, reachedOn: null },
    ]);
  });

  test('dates a milestone by the deposit that reached it, counting oldest first', () => {
    const deposits = [
      { id: 'd3', amount: 4_000_000, depositedOn: '2026-09-25' },
      { id: 'd2', amount: 4_000_000, depositedOn: '2026-08-25' },
    ];
    const reached = milestonesOf(goalRow(), deposits).find(
      (milestone) => milestone.key === EMERGENCY_MILESTONE.threeMonths,
    );
    expect(reached?.reachedOn).toBe('2026-09-25');
  });

  test('counts a deposit dated before the goal was made from its own day', () => {
    const early = [{ id: 'd0', amount: 100_000, depositedOn: '2026-06-01' }];
    const row = goalRow({ initialAmount: 900_000 });
    expect(milestonesOf(row, early)[0]?.reachedOn).toBe('2026-07-01');
    const enough = [{ id: 'd0', amount: 1_000_000, depositedOn: '2026-06-01' }];
    expect(milestonesOf(goalRow({ initialAmount: 0 }), enough)[0]?.reachedOn).toBe('2026-06-01');
  });

  test('rounds 1 minggu to whole rupiah', () => {
    const row = goalRow({ inputs: { essentialExpense: 1_000_000 }, initialAmount: 0 });
    expect(milestonesOf(row, [])[0]?.amount).toBe(233_333);
  });

  test('has none for any other goal, or an emergency fund without its essential spending', () => {
    expect(milestonesOf(goalRow({ kind: GOAL_KIND.houseDp }), [])).toEqual([]);
    expect(milestonesOf(goalRow({ inputs: {} }), [])).toEqual([]);
  });
});

describe('goals', () => {
  test('lists summaries', async () => {
    const [summary] = await listGoalSummaries(USER, { repository: createGoalRepositoryMock() });
    expect(summary).toEqual({
      id: GOAL_ID,
      kind: GOAL_KIND.emergencyFund,
      name: 'Dana Darurat',
      targetAmount: 25_200_000,
      targetDate: '2029-04-25',
      monthlyDeposit: 650_000,
      savedAmount: 4_800_000,
    });
  });

  test('creates an emergency fund as the one per person, any other goal freely', async () => {
    const flags: boolean[] = [];
    const repository = createGoalRepositoryMock({
      insertGoal: async (_userId, _goal, isEmergency) => {
        flags.push(isEmergency);
        return goalRow();
      },
    });
    const body = {
      kind: GOAL_KIND.emergencyFund,
      name: 'Dana Darurat',
      inputs: { essentialExpense: 4_200_000 },
      initialAmount: 4_800_000,
      monthlyDeposit: 650_000,
      targetAmount: 25_200_000,
      targetDate: '2029-04-25',
      inBudget: false,
    };
    const goal = await createGoal(USER, body, { repository });
    await createGoal(USER, { ...body, kind: GOAL_KIND.goods }, { repository });
    expect(flags).toEqual([true, false]);
    expect(goal.createdAt).toBe('2026-07-01T03:00:00.000Z');
  });

  test('details a goal, its deposits newest first, and throws GOAL_NOT_FOUND for a stranger', async () => {
    const deposit = { id: DEPOSIT_ID, goalId: GOAL_ID, amount: 650_000, depositedOn: '2026-09-25' };
    const repository = createGoalRepositoryMock({ listDeposits: async () => [deposit] });
    const detail = await getGoalDetail(USER, GOAL_ID, { repository });
    expect(detail.deposits).toEqual([
      { id: DEPOSIT_ID, amount: 650_000, depositedOn: '2026-09-25' },
    ]);
    const missing = createGoalRepositoryMock({ findGoal: async () => null });
    expect(getGoalDetail(USER, GOAL_ID, { repository: missing })).rejects.toMatchObject({
      code: 'GOAL_NOT_FOUND',
    });
  });

  test("refuses an emergency fund's inputs without its essential spending", async () => {
    const repository = createGoalRepositoryMock();
    expect(
      updateGoal(USER, GOAL_ID, { inputs: { married: true } }, { repository }),
    ).rejects.toMatchObject({ statusCode: 400, code: 'VALIDATION_FAILED' });
    const other = createGoalRepositoryMock({
      findGoal: async () => goalRow({ kind: GOAL_KIND.goods }),
    });
    expect((await updateGoal(USER, GOAL_ID, { inputs: {} }, { repository: other })).id).toBe(
      GOAL_ID,
    );
  });

  test('updates a goal, GOAL_NOT_FOUND when nothing matched', async () => {
    const goal = await updateGoal(
      USER,
      GOAL_ID,
      { name: 'Darurat' },
      {
        repository: createGoalRepositoryMock(),
      },
    );
    expect(goal.id).toBe(GOAL_ID);
    const none = createGoalRepositoryMock({ updateGoal: async () => false });
    expect(updateGoal(USER, GOAL_ID, { name: 'X' }, { repository: none })).rejects.toMatchObject({
      code: 'GOAL_NOT_FOUND',
    });
  });

  test('records a deposit once, refusing an id that belongs to another goal', async () => {
    const body = { depositId: DEPOSIT_ID, amount: 650_000, depositedOn: '2026-09-25' };
    const deposit = await addGoalDeposit(USER, GOAL_ID, body, {
      repository: createGoalRepositoryMock(),
    });
    expect(deposit).toEqual({ id: DEPOSIT_ID, amount: 650_000, depositedOn: '2026-09-25' });
    const elsewhere = createGoalRepositoryMock({
      insertDeposit: async (row) => ({ ...row, goalId: 'another-goal' }),
    });
    expect(addGoalDeposit(USER, GOAL_ID, body, { repository: elsewhere })).rejects.toMatchObject({
      code: 'GOAL_DEPOSIT_CONFLICT',
    });
  });
});
