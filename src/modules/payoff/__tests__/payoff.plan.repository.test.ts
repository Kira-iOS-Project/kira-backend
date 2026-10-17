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

  test('locks the person, ends the active plan and stores the new one in one transaction', async () => {
    const fake = createFakeDb(inOrder([{ id: 'user-1' }], [], [PLAN_ROW]));
    const plan = await createPlanRepository(fake.db).createPlan(
      'user-1',
      { method: 'snowball', extraPayment: 0, focusDebtId: null },
      NOW,
    );

    expect(sqlOf(fake)).toEqual([
      'select "id" from',
      'update "payoff_plans" set',
      'insert into "payoff_plans"',
    ]);
    /** A second Jadikan Rencanaku waits on this lock, then ends this plan: no unique-index 500. */
    expect(fake.queries[0]?.sql).toContain('for no key update');
    expect(fake.queries[1]?.sql).toContain('"ended_at" is null');
    expect(plan.id).toBe(PAYOFF_PLAN.id);
  });

  test('fails loudly when the insert returns no row', async () => {
    const fake = createFakeDb(inOrder([], [], []));
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

  test('records a payment once, then applies it against the balance it expects', async () => {
    const fake = createFakeDb(inOrder([{ id: 'payment-1' }], [{ id: 'debt-1' }]));
    const outcome = await createPlanRepository(fake.db).recordPayment(
      'user-1',
      'debt-1',
      { amount: 420_000, from: 420_000, to: 0, paymentId: 'pay-1' },
      NOW,
    );

    expect(outcome).toBe('applied');
    expect(sqlOf(fake)).toEqual(['insert into "debt_payments"', 'update "debt_accounts" set']);
    expect(fake.queries[0]?.sql).toContain(
      'on conflict ("user_id","client_payment_id") do nothing',
    );
    expect(fake.queries[0]?.params).toEqual(expect.arrayContaining([420_000, 'pay-1']));
    expect(fake.queries[1]?.sql).toContain('"paid_off_at" is null');
    expect(fake.queries[1]?.sql).toContain('"remaining_amount" = $');
  });

  test('a repeated payment id changes nothing', async () => {
    const fake = createFakeDb(inOrder([]));
    const outcome = await createPlanRepository(fake.db).recordPayment(
      'user-1',
      'debt-1',
      { amount: 1_000, from: 420_000, to: 419_000, paymentId: 'pay-1' },
      NOW,
    );

    expect(outcome).toBe('duplicate');
    expect(fake.queries).toHaveLength(1);
  });

  test('rolls the payment back when the balance changed meanwhile', async () => {
    const fake = createFakeDb(inOrder([{ id: 'payment-1' }], []));
    const outcome = await createPlanRepository(fake.db).recordPayment(
      'user-1',
      'debt-1',
      { amount: 1_000, from: 420_000, to: 419_000, paymentId: 'pay-2' },
      NOW,
    );

    expect(outcome).toBe('stale');
    expect(fake.queries).toHaveLength(2);
  });

  test('rethrows any other failure of the payment', async () => {
    const fake = createFakeDb(() => {
      throw new Error('connection lost');
    });
    const repository = createPlanRepository(fake.db);
    const payment = { amount: 1_000, from: 420_000, to: 419_000, paymentId: 'pay-3' };
    await expect(repository.recordPayment('user-1', 'debt-1', payment, NOW)).rejects.toThrow(
      'Failed query',
    );
  });

  test('finds a recorded payment id, and the accounts paid off since the plan began', async () => {
    const paidOffAt = new Date('2026-10-20T03:00:00.000Z');
    const fake = createFakeDb(
      inOrder(
        [{ id: 'payment-1' }],
        [],
        [{ ...PLAN_DEBTS[0], paidOffAt: paidOffAt.toISOString() }],
      ),
    );
    const repository = createPlanRepository(fake.db);

    expect(await repository.hasPayment('user-1', 'pay-1')).toBe(true);
    expect(await repository.hasPayment('user-1', 'pay-2')).toBe(false);
    const [paid] = await repository.listPaidSince('user-1', NOW);
    expect(paid?.name).toBe('Paylater A');
    expect(fake.queries[2]?.sql).toContain('"paid_off_at" >= $');
    expect(fake.queries[2]?.sql).toContain('order by "debt_accounts"."paid_off_at"');
  });
});
