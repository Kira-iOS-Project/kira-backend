/**
 * A health check retake against the accounts already there: payments, paid-off accounts and Dompet's
 * accounts survive; the quiz's own accounts are updated in place, added or removed.
 */

import { describe, expect, test } from 'bun:test';
import { DEBT_KIND } from '../../../lib/constants/profile.ts';
import { createFakeDb, inOrder } from '../../../test/fake-postgres.ts';
import { syncHealthCheckDebts } from '../score.debts.repository.ts';

const answer = (name: string, remaining: number) => ({
  kind: DEBT_KIND.paylater,
  name,
  remaining,
  monthlyInstalment: 210_000,
  remainingTenorMonths: null,
  annualInterestRate: 24,
  dueDay: 5,
});

const row = (id: string, name: string, kept: boolean) => ({
  id,
  kind: DEBT_KIND.paylater,
  name,
  kept,
});

async function retake(existing: ReturnType<typeof row>[], answers: ReturnType<typeof answer>[]) {
  const fake = createFakeDb(inOrder(existing, [], [], [], []));
  await fake.db.transaction((tx) => syncHealthCheckDebts(tx, 'user-1', answers));
  return fake.queries.map((query) => ({ sql: query.sql, params: query.params }));
}

describe('syncHealthCheckDebts', () => {
  test('reads only the health check’s own accounts, with whether a payment or payoff keeps them', async () => {
    const [read] = await retake([], []);
    expect(read?.sql).toContain('"from_health_check" = $');
    expect(read?.sql).toContain(
      '"paid_off_at" is not null or exists (select 1 from "debt_payments"',
    );
    expect(read?.params).toContain('user-1');
  });

  test('a retake keeps an account with payments: no update, no delete, so its payments stay', async () => {
    const queries = await retake(
      [row('debt-paid', 'Paylater A', true)],
      [answer('Paylater A', 999_000)],
    );
    expect(queries).toHaveLength(1);
  });

  test('a protected account the retake no longer names is kept too', async () => {
    const queries = await retake([row('debt-paid', 'Paylater A', true)], []);
    expect(queries).toHaveLength(1);
  });

  test('a matching account without payments is updated in place, by kind and name in any case', async () => {
    const queries = await retake(
      [row('debt-a', 'Paylater A', false)],
      [answer(' paylater a ', 300_000)],
    );

    expect(queries).toHaveLength(2);
    expect(queries[1]?.sql).toContain('update "debt_accounts" set');
    expect(queries[1]?.params).toEqual(expect.arrayContaining([300_000, 'debt-a']));
  });

  test('a new answer is added; an unprotected account no answer names is removed', async () => {
    const queries = await retake(
      [row('debt-old', 'Pinjol B', false)],
      [answer('Paylater C', 500_000)],
    );

    expect(queries.map((query) => query.sql.split(' ').slice(0, 3).join(' '))).toEqual([
      'select "id", "kind",',
      'delete from "debt_accounts"',
      'insert into "debt_accounts"',
    ]);
    expect(queries[1]?.params).toContain('debt-old');
    expect(queries[2]?.params).toEqual(expect.arrayContaining(['user-1', 'Paylater C', 500_000]));
  });
});
