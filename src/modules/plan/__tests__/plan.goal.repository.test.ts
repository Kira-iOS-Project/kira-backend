import { describe, expect, test } from 'bun:test';
import { createFakeDb } from '../../../test/fake-postgres.ts';
import { createGoalRepository } from '../plan.goal.repository.ts';
import { DEPOSIT_ID, GOAL_ID, goalDbRow, goalRow } from './helpers.ts';

const { id: _id, createdAt: _c, updatedAt: _u, savedAmount: _s, ...NEW_GOAL } = goalRow();

describe('createGoalRepository', () => {
  test('lists the emergency fund first, then the newest, with what each has saved', async () => {
    const fake = createFakeDb(() => [goalDbRow()]);
    const [goal] = await createGoalRepository(fake.db).listGoals('user-1');
    expect(goal?.savedAmount).toBe(4_800_000);
    expect(goal?.createdAt).toEqual(goalRow().createdAt);
    const sql = fake.queries[0]?.sql ?? '';
    expect(sql).toContain(
      'coalesce((select sum("goal_deposits"."amount") from "goal_deposits" where "goal_deposits"."goal_id" = "goals"."id"), 0)',
    );
    expect(sql).toContain('order by "goals"."emergency_owner" is null, "goals"."created_at" desc');
  });

  test('inserts a goal and reads it back, the emergency fund under its owner', async () => {
    const fake = createFakeDb((query) =>
      query.sql.startsWith('insert') ? [{ id: GOAL_ID }] : [goalDbRow()],
    );
    const goal = await createGoalRepository(fake.db).insertGoal('user-1', NEW_GOAL, true);
    expect(goal.id).toBe(GOAL_ID);
    expect(fake.queries[0]?.params).toContain('user-1');
  });

  test('turns the emergency index refusing a second fund into GOAL_EMERGENCY_EXISTS', async () => {
    const wrapped = new Error('insert failed', {
      cause: Object.assign(new Error('duplicate'), {
        code: '23505',
        constraint_name: 'goals_emergency_owner_idx',
      }),
    });
    const fake = createFakeDb(() => {
      throw wrapped;
    });
    expect(
      createGoalRepository(fake.db).insertGoal('user-1', NEW_GOAL, true),
    ).rejects.toMatchObject({
      code: 'GOAL_EMERGENCY_EXISTS',
    });
  });

  test('passes any other failure on, and one whose row cannot be read back', async () => {
    const broken = createFakeDb(() => {
      throw new Error('connection lost');
    });
    expect(
      createGoalRepository(broken.db).insertGoal('user-1', NEW_GOAL, false),
    ).rejects.toMatchObject({
      cause: { message: 'connection lost' },
    });
    const vanished = createFakeDb((query) =>
      query.sql.startsWith('insert') ? [{ id: GOAL_ID }] : [],
    );
    expect(createGoalRepository(vanished.db).insertGoal('user-1', NEW_GOAL, false)).rejects.toThrow(
      'could not be read back',
    );
  });

  test("updates only the person's goal and says whether one matched", async () => {
    const fake = createFakeDb(() => []);
    expect(await createGoalRepository(fake.db).updateGoal('user-1', GOAL_ID, { name: 'X' })).toBe(
      false,
    );
    expect(fake.queries[0]?.sql).toStartWith('update "goals"');
  });

  test('lists deposits newest first, and every deposit of the person for the export', async () => {
    const row = { id: DEPOSIT_ID, goalId: GOAL_ID, amount: 650_000, depositedOn: '2026-09-25' };
    const fake = createFakeDb((query) =>
      query.sql.includes('inner join') ? [{ ...row, goalName: 'Dana Darurat' }] : [row],
    );
    const repository = createGoalRepository(fake.db);
    expect(await repository.listDeposits(GOAL_ID)).toEqual([row]);
    expect(await repository.listAllDeposits('user-1')).toEqual([
      { ...row, goalName: 'Dana Darurat' },
    ]);
  });

  test('stores a deposit once and answers the stored row for its id', async () => {
    const row = { id: DEPOSIT_ID, goalId: GOAL_ID, amount: 650_000, depositedOn: '2026-09-25' };
    const fake = createFakeDb((query) => (query.sql.startsWith('select') ? [row] : []));
    expect(await createGoalRepository(fake.db).insertDeposit(row)).toEqual(row);
    expect(fake.queries[0]?.sql).toContain('on conflict ("id") do nothing');
    const empty = createFakeDb(() => []);
    expect(await createGoalRepository(empty.db).insertDeposit(row)).toEqual(row);
  });
});
