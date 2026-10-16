/**
 * The account routes through the real app: the session gate, the real error mapper, the shared
 * Postgres double answering by table, and the shared Resend double.
 */

import { beforeEach, describe, expect, test } from 'bun:test';
import { app } from '../../../app.ts';
import { CONSENT_PURPOSE } from '../../../lib/constants/consents.ts';
import {
  EXPENSE_CATEGORY,
  TRANSACTION_SOURCE,
  TRANSACTION_TYPE,
} from '../../../lib/constants/money.ts';
import { FOCUS } from '../../../lib/constants/profile.ts';
import type { FakeQuery, FakeRow } from '../../../test/fake-postgres.ts';
import { dbControl, emailControl, resetExternalMocks } from '../../../test/preload.ts';
import { AUTH_HEADER, signedIn, TEST_USER_ID } from '../../../test/session.ts';
import { createProfile } from './helpers.ts';

beforeEach(() => {
  resetExternalMocks();
  dbControl.respond = signedIn(byTable);
});

const EXPORT_ROW = {
  occurredAt: '2026-10-16T05:41:00.000Z',
  type: TRANSACTION_TYPE.expense,
  category: EXPENSE_CATEGORY.food,
  name: 'Nasi Padang',
  amount: 25_000,
  source: TRANSACTION_SOURCE.chat,
  note: null,
};

/** The profile for a select on users, the export rows for an unfiltered transactions read. */
function byTable(query: FakeQuery): FakeRow[] {
  if (!query.sql.startsWith('select')) return [];
  if (query.sql.startsWith('select "debt_emergency_mode_used_at"')) return [];
  if (query.sql.includes('from "users"')) return [createProfile()];
  if (query.sql.includes('from "transactions"') && query.params.length === 2) return [EXPORT_ROW];
  return [];
}

function call(method: string, path: string, body?: unknown) {
  return app.request(path, {
    method,
    headers: { 'Content-Type': 'application/json', ...AUTH_HEADER },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

describe('GET and PATCH /api/me', () => {
  test('refuses a request without a session', async () => {
    const res = await app.request('/api/me');

    expect(res.status).toBe(401);
  });

  test('answers the account', async () => {
    const res = await call('GET', '/api/me');
    const me = await res.json();

    expect(res.status).toBe(200);
    expect(me).toMatchObject({ id: TEST_USER_ID, displayName: 'Dinda', consented: false });
    expect(me.debtEmergencyActive).toBe(false);
  });

  test('says Mode Darurat Utang is active once it has been opened', async () => {
    dbControl.respond = signedIn((query) =>
      query.sql.startsWith('select') && query.sql.includes('from "users"')
        ? [createProfile({ debtEmergencyModeUsedAt: new Date('2026-10-16T05:41:00.000Z') })]
        : byTable(query),
    );

    expect((await (await call('GET', '/api/me')).json()).debtEmergencyActive).toBe(true);
  });

  test('changes the focus and answers the account', async () => {
    const res = await call('PATCH', '/api/me', { focus: FOCUS.debtFree });

    expect(res.status).toBe(200);
    expect(dbControl.queries.some((query) => query.sql.startsWith('update "users"'))).toBe(true);
  });

  test('refuses a payday past the 31st', async () => {
    const res = await call('PATCH', '/api/me', { payday: { day: 40, endOfMonth: false } });

    expect(res.status).toBe(422);
  });
});

describe('/api/me/consents', () => {
  test('reads the consents', async () => {
    const res = await call('GET', '/api/me/consents');

    expect(res.status).toBe(200);
    expect((await res.json()).items[0]).toEqual({
      purpose: CONSENT_PURPOSE.core,
      granted: true,
      decidedAt: null,
    });
  });

  test('records the toggles', async () => {
    const res = await call('PUT', '/api/me/consents', { aiProcessing: true, weeklySummary: true });

    expect(res.status).toBe(200);
    expect(dbControl.queries.some((query) => query.sql.startsWith('insert into "consents"'))).toBe(
      true,
    );
  });
});

describe('/api/me/export', () => {
  test('downloads the CSV as an attachment', async () => {
    const res = await call('GET', '/api/me/export');

    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/csv');
    expect(res.headers.get('content-disposition')).toMatch(
      /^attachment; filename="kira-data-\d{4}-\d{2}-\d{2}\.csv"$/,
    );
    expect(await res.text()).toContain('Nasi Padang,25000,Chat');
  });

  test('emails the CSV', async () => {
    const res = await call('POST', '/api/me/export/email');

    expect(res.status).toBe(202);
    expect(emailControl.sent[0]?.attachments).toHaveLength(1);
  });

  test('answers 503 when the email cannot be sent', async () => {
    emailControl.send = async () => {
      throw new Error('Resend answered 500');
    };

    const res = await call('POST', '/api/me/export/email');

    expect(res.status).toBe(503);
    expect((await res.json()).code).toBe('EMAIL_DELIVERY_FAILED');
  });
});

describe('POST /api/me/deletion', () => {
  test('accepts the confirmation in any case, emails, then deletes', async () => {
    const res = await call('POST', '/api/me/deletion', { confirmation: ' hapus ' });

    expect(res.status).toBe(204);
    expect(emailControl.sent).toHaveLength(1);
    expect(dbControl.queries.at(-1)?.sql).toStartWith('delete from "users"');
  });

  test('deletes even when the email fails', async () => {
    emailControl.send = async () => {
      throw new Error('Resend answered 500');
    };

    const res = await call('POST', '/api/me/deletion', { confirmation: 'HAPUS' });

    expect(res.status).toBe(204);
    expect(dbControl.queries.at(-1)?.sql).toStartWith('delete from "users"');
  });

  test('refuses any other confirmation with a 422 and deletes nothing', async () => {
    const res = await call('POST', '/api/me/deletion', { confirmation: 'HAPUSKAN' });

    expect(res.status).toBe(422);
    expect((await res.json()).fields).toEqual({ confirmation: 'custom' });
    expect(dbControl.queries.some((query) => query.sql.startsWith('delete'))).toBe(false);
  });
});
