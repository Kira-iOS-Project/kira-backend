import { describe, expect, test } from 'bun:test';
import {
  BILLING_PERIOD,
  PAYMENT_METHOD,
  PLAN,
  SUBSCRIPTION_STATUS,
} from '../../../lib/constants/plans.ts';
import { createFakeDb, inOrder } from '../../../test/fake-postgres.ts';
import { createBillingJobsRepository } from '../billing-jobs.repository.ts';
import { NOW, USER_ID } from './helpers.ts';

const BEFORE = new Date('2026-10-19T17:00:00.000Z');
const END = new Date('2026-11-16T05:10:00.000Z');

describe('createBillingJobsRepository', () => {
  test('finds due reminders with the person’s address, bounded', async () => {
    const row = {
      subscriptionId: 'sub-1',
      email: 'dinda@email.com',
      displayName: 'Dinda',
      plan: PLAN.plus,
      period: BILLING_PERIOD.monthly,
      paymentMethod: PAYMENT_METHOD.qris,
      currentPeriodEnd: END.toISOString(),
    };
    const fake = createFakeDb(inOrder([row]));

    const rows = await createBillingJobsRepository(fake.db).findDueReminders(NOW, BEFORE, 100);

    expect(rows).toEqual([{ ...row, currentPeriodEnd: END }]);
    expect(fake.queries[0]?.sql).toContain('inner join "users"');
    expect(fake.queries[0]?.sql).toContain('"subscriptions"."reminder_sent_at" is null');
    expect(fake.queries[0]?.params.at(-1)).toBe(100);
  });

  test('claims a reminder only while none is stamped, and releases only its own claim', async () => {
    const fake = createFakeDb(inOrder([{ id: 'sub-1' }], []));
    const repository = createBillingJobsRepository(fake.db);

    expect(await repository.claimReminder('sub-1', NOW)).toBe(true);
    /** Another run stamped it first: the guarded update matches no row. */
    expect(await repository.claimReminder('sub-1', NOW)).toBe(false);
    await repository.releaseReminder('sub-1', NOW);

    expect(fake.queries[0]?.sql).toContain('"reminder_sent_at" = $1');
    expect(fake.queries[0]?.sql).toContain(
      'where ("subscriptions"."id" = $3 and "subscriptions"."reminder_sent_at" is null) returning "id"',
    );
    expect(fake.queries[0]?.params[0]).toBe(NOW.toISOString());
    expect(fake.queries[2]?.sql).toContain('"reminder_sent_at" = $1');
    expect(fake.queries[2]?.sql).toContain('"subscriptions"."reminder_sent_at" = $4');
    expect(fake.queries[2]?.params[0]).toBeNull();
    expect(fake.queries[2]?.params.slice(-2)).toEqual(['sub-1', NOW.toISOString()]);
  });

  test('ends cancelled and granted plans whose period ran out', async () => {
    const fake = createFakeDb(inOrder([{ id: 'sub-1' }, { id: 'sub-2' }]));

    expect(await createBillingJobsRepository(fake.db).endFinishedPeriods(NOW)).toBe(2);
    expect(fake.queries[0]?.sql).toContain('"subscriptions"."cancel_at_period_end" = $');
    expect(fake.queries[0]?.sql).toContain('"subscriptions"."source" = $');
  });

  test('renews run-out periods in WIB and writes one invoice each', async () => {
    const renewed = {
      id: 'sub-1',
      userId: USER_ID,
      plan: PLAN.young,
      period: BILLING_PERIOD.monthly,
      paymentMethod: null,
      currentPeriodStart: NOW.toISOString(),
      currentPeriodEnd: END.toISOString(),
    };
    const fake = createFakeDb(inOrder([renewed], []));

    const count = await createBillingJobsRepository(fake.db).renewDuePeriods(
      NOW,
      100,
      () => 15_000,
    );

    expect(count).toBe(1);
    expect(fake.queries[0]?.sql).toContain('at time zone $');
    expect(fake.queries[0]?.sql).toContain('"reminder_sent_at" = $');
    expect(fake.queries[1]?.sql).toStartWith('insert into "invoices"');
    expect(fake.queries[1]?.params).toContain(15_000);
    expect(fake.queries[1]?.params).toContain(PAYMENT_METHOD.qris);
  });

  test('renews only rows still due, skipping those an overlapping run holds', async () => {
    const fake = createFakeDb();

    await createBillingJobsRepository(fake.db).renewDuePeriods(NOW, 100, () => 0);

    const sql = fake.queries[0]?.sql ?? '';
    const [inner = '', outer = ''] = sql.split(' for update skip locked)');
    expect(inner).toContain('"subscriptions"."current_period_end" <= $');
    expect(outer).toContain('"subscriptions"."status" = $');
    expect(outer).toContain('"subscriptions"."current_period_end" <= $');
    expect(fake.queries[0]?.params.slice(-2)).toEqual([
      SUBSCRIPTION_STATUS.active,
      NOW.toISOString(),
    ]);
  });

  test('counts the next end from the first invoice’s start, not the previous end', async () => {
    const fake = createFakeDb();

    await createBillingJobsRepository(fake.db).renewDuePeriods(NOW, 100, () => 0);

    const sql = fake.queries[0]?.sql ?? '';
    expect(sql).toContain(
      'coalesce((select min("invoices"."period_start") from "invoices" where "invoices"."subscription_id" = "subscriptions"."id"), "subscriptions"."current_period_start")',
    );
    expect(sql).toContain('+ make_interval(months => ((extract(year from');
    expect(sql).toContain('then 12 else 1 end)) at time zone $');
    expect(sql).not.toContain('"current_period_end" at time zone $1) +');
  });

  test('writes no invoice when nothing ran out', async () => {
    const fake = createFakeDb();

    expect(await createBillingJobsRepository(fake.db).renewDuePeriods(NOW, 100, () => 0)).toBe(0);
    expect(fake.queries).toHaveLength(1);
  });
});
