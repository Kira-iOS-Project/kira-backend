/** Cek Legalitas through the real app, the session gate, request validation and the error mapper. */

import { beforeEach, describe, expect, test } from 'bun:test';
import { app } from '../../../app.ts';
import { dbControl, resetExternalMocks } from '../../../test/preload.ts';
import { AUTH_HEADER, signedIn } from '../../../test/session.ts';

beforeEach(() => resetExternalMocks());

/** A search as the signed-in test person. */
const search = (q: string) =>
  app.request(`/api/legality?q=${encodeURIComponent(q)}`, { headers: AUTH_HEADER });

describe('GET /api/legality', () => {
  test('answers 401 without a session', async () => {
    const res = await app.request('/api/legality?q=kredit');
    expect(res.status).toBe(401);
  });

  test('answers the matches with the date and source of the list', async () => {
    dbControl.respond = signedIn();
    const res = await search('julo');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.results[0].company).toBe('PT JULO Teknologi Finansial');
    expect(body.asOf).toBe('2026-07-31');
  });

  test('refuses a query shorter than two characters with a 422', async () => {
    dbControl.respond = signedIn();
    expect((await search('a')).status).toBe(422);
  });
});
