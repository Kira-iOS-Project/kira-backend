import { describe, expect, test } from 'bun:test';
import { createFakeDb, inOrder } from '../../../test/fake-postgres.ts';
import { createPlanRepository } from '../payoff.plan.repository.ts';
import { NOW, PAYOFF_PLAN, PLAN_DEBTS } from './helpers.ts';

const PLAN_ROW = { ...PAYOFF_PLAN, createdAt: PAYOFF_PLAN.createdAt.toISOString() };
const sqlOf = (fake: ReturnType<typeof createFakeDb>) =>
  fake.queries.map((query) => query.sql.split(' ').slice(0, 3).join(' '));

describe('createPlanRepository', () => {
  test('reads the active plan, or none', async () => {
    const fake = createFakeDb(inOrder([PLAN_ROW], []));
    const repository = createPlanRepository(fake.db);

    expect(await repository.findActive('user-1')).toMatchObject({
      id: PAYOFF_PLAN.id,
      method: 'snowball',
    });
    expect(await repository.findActive('user-1')).toBeNull();
    expect(fake.queries[0]?.sql).toContain('"ended_at" is null');
    expect(fake.queries[0]?.params).toContain('user-1');
  });

  test('lists the open accounts that still owe something, oldest first', async () => {
    const fake = createFakeDb(inOrder(PLAN_DEBTS));
    const rows = await createPlanRepository(fake.db).listDebts('user-1');
    const [query] = fake.queries;

    expect(rows).toHaveLength(3);
    expect(query?.sql).toContain('"paid_off_at" is null');
    expect(query?.sql).toContain('"remaining_amount" > $');
    expect(query?.sql).toContain('order by "debt_accounts"."created_at"');
    expect(query?.params).toContain(50);
  });

  test("finds one of the person's open accounts, or none", async () => {
    const fake = createFakeDb(inOrder([PLAN_DEBTS[0] ?? {}], []));
    const repository = createPlanRepository(fake.db);

    expect((await repository.findDebt('user-1', 'debt-1'))?.name).toBe('Paylater A');
    expect(await repository.findDebt('user-1', 'debt-2')).toBeNull();
    expect(fake.queries[0]?.params).toEqual(expect.arrayContaining(['user-1', 'debt-1']));
  });

  test('ends the active plan and stores the new one in one transaction', async () => {
    const fake = createFakeDb(inOrder([], [PLAN_ROW]));
    const plan = await createPlanRepository(fake.db).createPlan(
      'user-1',
      { method: 'snowball', extraPayment: 0, focusDebtId: null },
      NOW,
    );

    expect(sqlOf(fake)).toEqual(['update "payoff_plans" set', 'insert into "payoff_plans"']);
    expect(fake.queries[0]?.sql).toContain('"ended_at" is null');
    expect(plan.id).toBe(PAYOFF_PLAN.id);
  });

  test('fails loudly when the insert returns no row', async () => {
    const fake = createFakeDb(inOrder([], []));
    await expect(
      createPlanRepository(fake.db).createPlan(
        'user-1',
        { method: 'snowball', extraPayment: 0, focusDebtId: null },
        NOW,
      ),
    ).rejects.toThrow();
  });

  test('sets the focus', async () => {
    const fake = createFakeDb(inOrder([]));
    await createPlanRepository(fake.db).setFocus('plan-1', 'debt-2');

    expect(fake.queries[0]?.sql).toContain('update "payoff_plans" set "focus_debt_id"');
    expect(fake.queries[0]?.params).toEqual(expect.arrayContaining(['debt-2', 'plan-1']));
  });

  test('applies a payment against the balance it expects, then records it', async () => {
    const fake = createFakeDb(inOrder([{ id: 'debt-1' }], []));
    const applied = await createPlanRepository(fake.db).recordPayment(
      'user-1',
      'debt-1',
      { amount: 420_000, from: 420_000, to: 0 },
      NOW,
    );

    expect(applied).toBe(true);
    expect(sqlOf(fake)).toEqual(['update "debt_accounts" set', 'insert into "debt_payments"']);
    expect(fake.queries[0]?.sql).toContain('"paid_off_at" is null');
    expect(fake.queries[0]?.sql).toContain('"remaining_amount" = $');
    expect(fake.queries[0]?.params).toContain(420_000);
    expect(fake.queries[1]?.params).toContain(420_000);
  });

  test('records nothing when the balance changed meanwhile', async () => {
    const fake = createFakeDb(inOrder([]));
    const applied = await createPlanRepository(fake.db).recordPayment(
      'user-1',
      'debt-1',
      { amount: 1_000, from: 420_000, to: 419_000 },
      NOW,
    );

    expect(applied).toBe(false);
    expect(fake.queries).toHaveLength(1);
  });
});
