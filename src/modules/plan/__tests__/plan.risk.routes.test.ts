/**
 * Kenali Profil Risikomu through the real app: PUT computes and stores the profile, GET reads it
 * (every field null before the quiz), with the session gate and the shared Postgres double.
 */

import { beforeEach, describe, expect, test } from 'bun:test';
import { app } from '../../../app.ts';
import { dbControl, resetExternalMocks } from '../../../test/preload.ts';
import { AUTH_HEADER, signedIn } from '../../../test/session.ts';

beforeEach(() => resetExternalMocks());

const AT = '2026-10-17T05:00:00.000Z';

function put(body: unknown) {
  return app.request('/api/risk-profile', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', ...AUTH_HEADER },
    body: JSON.stringify(body),
  });
}

/** Answers the upsert with what it was given, as Postgres would. */
const stores = signedIn((query) =>
  query.sql.startsWith('insert into "risk_profiles"')
    ? [{ answers: query.params[1], profile: query.params[2], updatedAt: AT }]
    : [],
);

describe('PUT /api/risk-profile', () => {
  test("answers the board's persona with Moderat, and only the profile, answers and date", async () => {
    dbControl.respond = stores;
    const res = await put({ answers: [1, 1, 1, 0, 1] });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      profile: 'moderate',
      answers: [1, 1, 1, 0, 1],
      updatedAt: AT,
    });
  });

  test('stores the profile the table gives, capped by the horizon', async () => {
    dbControl.respond = stores;
    expect((await (await put({ answers: [2, 2, 3, 3, 3] })).json()).profile).toBe('aggressive');
    expect((await (await put({ answers: [2, 2, 0, 3, 3] })).json()).profile).toBe('conservative');
  });

  test('answers 422 to anything but five indexes from 0 to 3', async () => {
    dbControl.respond = stores;
    for (const answers of [
      [1, 1, 1, 1],
      [1, 1, 1, 1, 1, 1],
      [-1, 1, 1, 1, 1],
      [4, 1, 1, 1, 1],
      [1.5, 1, 1, 1, 1],
    ]) {
      const res = await put({ answers });
      expect(res.status).toBe(422);
      expect((await res.json()).code).toBe('VALIDATION_FAILED');
    }
    expect((await put({})).status).toBe(422);
  });

  test('answers 401 without a session, on both routes', async () => {
    expect((await app.request('/api/risk-profile', { method: 'PUT' })).status).toBe(401);
    expect((await app.request('/api/risk-profile')).status).toBe(401);
  });
});

describe('GET /api/risk-profile', () => {
  test('every field null before the quiz', async () => {
    dbControl.respond = signedIn();
    const res = await app.request('/api/risk-profile', { headers: AUTH_HEADER });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ profile: null, answers: null, updatedAt: null });
  });

  test('the stored profile after it, for Ulangi Kuis', async () => {
    dbControl.respond = signedIn((query) =>
      query.sql.includes('from "risk_profiles"')
        ? [{ answers: [2, 2, 3, 3, 3], profile: 'aggressive', updatedAt: AT }]
        : [],
    );
    const res = await app.request('/api/risk-profile', { headers: AUTH_HEADER });

    expect(await res.json()).toEqual({
      profile: 'aggressive',
      answers: [2, 2, 3, 3, 3],
      updatedAt: AT,
    });
  });
});
