import { beforeEach, describe, expect, test } from 'bun:test';
import { app } from '../../../app.ts';
import { dbControl, resetExternalMocks } from '../../../test/preload.ts';
import { AUTH_HEADER, signedIn } from '../../../test/session.ts';

const path = '/api/bills/00000000-0000-4000-8000-000000000001';

beforeEach(() => resetExternalMocks());

describe('DELETE /api/bills/{id}', () => {
  test('requires a session and archives only the signed-in owner schedule', async () => {
    expect((await app.request(path, { method: 'DELETE' })).status).toBe(401);
    dbControl.respond = signedIn((query) =>
      query.sql.startsWith('update "recurring_bills"')
        ? [{ id: '00000000-0000-4000-8000-000000000001' }]
        : [],
    );

    const response = await app.request(path, { method: 'DELETE', headers: AUTH_HEADER });

    expect(response.status).toBe(204);
    expect(await response.text()).toBe('');
    const archive = dbControl.queries.find(({ sql }) => sql.startsWith('update "recurring_bills"'));
    expect(archive?.sql).toContain('"user_id" =');
    expect(archive?.sql).toContain('"archived_at" is null');
  });

  test('returns 404 when the caller cannot archive the schedule', async () => {
    dbControl.respond = signedIn(() => []);

    const response = await app.request(path, { method: 'DELETE', headers: AUTH_HEADER });

    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({ code: 'BILL_NOT_FOUND' });
  });
});
