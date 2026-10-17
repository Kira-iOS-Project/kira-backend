import { describe, expect, test } from 'bun:test';
import { createFakeDb, inOrder } from '../../../test/fake-postgres.ts';
import { createExportEmailClaims } from '../account-export.repository.ts';
import { NOW, USER_ID } from './helpers.ts';

describe('createExportEmailClaims', () => {
  test('claims only when no send was recorded after the window start', async () => {
    const fake = createFakeDb(inOrder([{ id: USER_ID }], []));
    const claims = createExportEmailClaims(fake.db);
    const since = new Date(NOW.getTime() - 600_000);

    expect(await claims.claim(USER_ID, NOW, since)).toBe(true);
    expect(await claims.claim(USER_ID, NOW, since)).toBe(false);
    expect(fake.queries[0]?.sql).toContain(
      '"export_emailed_at" is null or "users"."export_emailed_at" < ',
    );
  });

  test('releases only its own claim', async () => {
    const fake = createFakeDb();
    await createExportEmailClaims(fake.db).release(USER_ID, NOW);
    expect(fake.queries[0]?.sql).toStartWith('update "users" set "export_emailed_at" = ');
    expect(fake.queries[0]?.params).toContain(USER_ID);
  });
});
