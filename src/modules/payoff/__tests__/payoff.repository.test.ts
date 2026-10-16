import { describe, expect, test } from 'bun:test';
import { createFakeDb, inOrder } from '../../../test/fake-postgres.ts';
import { createPayoffRepository } from '../payoff.repository.ts';
import { DINDA_OPEN } from './helpers.ts';

describe('createPayoffRepository', () => {
  test('reads the open accounts that still owe something, oldest first', async () => {
    const fake = createFakeDb(inOrder(DINDA_OPEN));
    const rows = await createPayoffRepository(fake.db).listOpenDebts('user-1');
    const [query] = fake.queries;

    expect(rows).toHaveLength(3);
    expect(query?.sql).toContain('from "debt_accounts"');
    expect(query?.sql).toContain('"paid_off_at" is null');
    expect(query?.sql).toContain('"remaining_amount" > $');
    expect(query?.sql).toContain('order by "debt_accounts"."created_at"');
    expect(query?.sql).toContain('limit $');
    expect(query?.params).toContain('user-1');
    expect(query?.params).toContain(50);
  });
});
