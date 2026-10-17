import { describe, expect, test } from 'bun:test';
import { createFakeDb } from '../../../test/fake-postgres.ts';
import { createBillRepository } from '../finance.repository.bills.ts';

const BILL_ID = '00000000-0000-4000-8000-000000000001';

describe('bill deletion repository', () => {
  test('archives the owner schedule so future occurrences stop and history is preserved', async () => {
    const fake = createFakeDb((query) =>
      query.sql.startsWith('update "recurring_bills"') ? [{ id: BILL_ID }] : [],
    );

    await expect(createBillRepository(fake.db).deleteBill('owner', BILL_ID)).resolves.toBe(true);

    expect(fake.queries).toHaveLength(1);
    expect(fake.queries[0]?.sql).toContain('update "recurring_bills"');
    expect(fake.queries[0]?.sql).toContain('"archived_at"');
    expect(fake.queries[0]?.sql).toContain('"user_id" =');
    expect(fake.queries[0]?.sql).toContain('"archived_at" is null');
    expect(
      fake.queries.some(({ sql }) => /delete from "(bill_payments|transactions)"/.test(sql)),
    ).toBe(false);
  });

  test('does not reveal another owner or an already archived schedule', async () => {
    const fake = createFakeDb(() => []);

    await expect(createBillRepository(fake.db).deleteBill('owner', BILL_ID)).resolves.toBe(false);
    expect(fake.queries[0]?.sql).toContain('"user_id" =');
    expect(fake.queries[0]?.sql).toContain('"archived_at" is null');
  });
});
