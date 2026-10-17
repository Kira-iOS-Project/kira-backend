/**
 * GET /api/summary/weekly through the real app, the session gate and the shared Postgres double.
 */

import { beforeEach, describe, expect, test } from 'bun:test';
import { app } from '../../../app.ts';
import { dbControl, resetExternalMocks } from '../../../test/preload.ts';
import { AUTH_HEADER, signedIn } from '../../../test/session.ts';

beforeEach(() => resetExternalMocks());

const get = (path: string) => app.request(path, { headers: AUTH_HEADER });

describe('GET /api/summary/weekly', () => {
  test('answers the week ending on `end`, with no budget', async () => {
    dbControl.respond = signedIn();
    const res = await get('/api/summary/weekly?end=2026-10-14');
    expect(res.status).toBe(200);
    const week = await res.json();
    expect(week.start).toBe('2026-10-08');
    expect(week.days).toHaveLength(7);
    expect(week.total).toBe(0);
    expect(week.budget).toBeNull();
  });

  test('refuses an end that is not a date with a 422, and needs a session', async () => {
    dbControl.respond = signedIn();
    expect((await get('/api/summary/weekly?end=14-10-2026')).status).toBe(422);
    expect((await app.request('/api/summary/weekly')).status).toBe(401);
  });
});
