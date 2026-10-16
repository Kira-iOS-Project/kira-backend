/**
 * The scholarship routes through the real app: the session gate, the real error mapper and the
 * shared Postgres double.
 */

import { beforeEach, describe, expect, test } from 'bun:test';
import { app } from '../../../app.ts';
import { SUBSCRIPTION_SOURCE } from '../../../lib/constants/plans.ts';
import {
  APPLICATION_STATUS,
  OPEN_APPLICATION_INDEX,
  SCHOLARSHIP_SITUATION,
} from '../../../lib/constants/scholarship.ts';
import { type FakeResponder, inOrder } from '../../../test/fake-postgres.ts';
import { dbControl, resetExternalMocks } from '../../../test/preload.ts';
import { AUTH_HEADER, signedIn, TEST_USER_ID } from '../../../test/session.ts';

beforeEach(() => resetExternalMocks());

function call(method: string, path: string, body?: unknown) {
  return app.request(path, {
    method,
    headers: { 'Content-Type': 'application/json', ...AUTH_HEADER },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

/** Answers the Mode Darurat Utang lookup as opened, and hands every other statement on. */
function usedDebtEmergency(next: FakeResponder = () => []): FakeResponder {
  return (query) =>
    query.sql.includes('"debt_emergency_mode_used_at" is not null')
      ? [{ id: TEST_USER_ID }]
      : next(query);
}

const STORED = {
  id: '9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d',
  status: APPLICATION_STATUS.waitlisted,
  situations: [SCHOLARSHIP_SITUATION.chasedByLender],
  story: null,
  submittedAt: '2026-10-16T05:10:00.000Z',
  decidedAt: null,
};

describe('scholarship routes', () => {
  test('refuse a request without a session', async () => {
    expect((await app.request('/api/scholarship')).status).toBe(401);
  });

  test('GET /api/scholarship answers eligibility and quota', async () => {
    dbControl.respond = signedIn(usedDebtEmergency());

    const res = await call('GET', '/api/scholarship');

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      eligible: true,
      ineligibleReason: null,
      quota: { remaining: 0, total: 0 },
      application: null,
    });
  });

  test('POST /api/scholarship/applications answers 201 on the waiting list', async () => {
    dbControl.respond = signedIn(usedDebtEmergency(inOrder([], [], [], [], [STORED])));

    const res = await call('POST', '/api/scholarship/applications', {
      situations: [SCHOLARSHIP_SITUATION.chasedByLender],
    });
    const body = await res.json();

    expect(res.status).toBe(201);
    expect(body).toMatchObject({ status: APPLICATION_STATUS.waitlisted, decideBy: '2026-10-21' });
  });

  test('POST /api/scholarship/applications answers 409 before Mode Darurat Utang is opened', async () => {
    dbControl.respond = signedIn();

    const res = await call('POST', '/api/scholarship/applications', {
      situations: [SCHOLARSHIP_SITUATION.chasedByLender],
    });

    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe('SCHOLARSHIP_NOT_ELIGIBLE');
  });

  test('POST /api/scholarship/applications counts the story in characters, as the app does', async () => {
    dbControl.respond = signedIn(usedDebtEmergency(inOrder([], [], [], [], [STORED])));
    const family = '👨‍👩‍👧';

    const fits = await call('POST', '/api/scholarship/applications', {
      situations: [SCHOLARSHIP_SITUATION.chasedByLender],
      story: family.repeat(1000),
    });
    const over = await call('POST', '/api/scholarship/applications', {
      situations: [SCHOLARSHIP_SITUATION.chasedByLender],
      story: family.repeat(1001),
    });

    expect(fits.status).toBe(201);
    expect(over.status).toBe(422);
    expect((await over.json()).code).toBe('VALIDATION_FAILED');
  });

  test('POST /api/scholarship/applications refuses no situation, and a paid plan', async () => {
    dbControl.respond = signedIn(inOrder([{ source: SUBSCRIPTION_SOURCE.purchase }]));

    const empty = await call('POST', '/api/scholarship/applications', { situations: [] });
    const paid = await call('POST', '/api/scholarship/applications', {
      situations: [SCHOLARSHIP_SITUATION.medicalCosts],
    });

    expect(empty.status).toBe(422);
    expect(paid.status).toBe(409);
    expect((await paid.json()).code).toBe('SCHOLARSHIP_NOT_ELIGIBLE');
  });

  test('POST /api/scholarship/applications answers 409, not 500, to a concurrent second apply', async () => {
    const duplicate = Object.assign(new Error('duplicate key value'), {
      code: '23505',
      constraint_name: OPEN_APPLICATION_INDEX,
    });
    dbControl.respond = signedIn((query) => {
      if (query.sql.startsWith('insert into "scholarship_applications"')) throw duplicate;
      return [];
    });

    const res = await call('POST', '/api/scholarship/applications', {
      situations: [SCHOLARSHIP_SITUATION.chasedByLender],
    });

    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe('SCHOLARSHIP_NOT_ELIGIBLE');
  });

  test('DELETE /api/scholarship/applications/current answers 204, or 404 with none', async () => {
    dbControl.respond = signedIn(inOrder([{ id: STORED.id }], []));

    const withdrawn = await call('DELETE', '/api/scholarship/applications/current');
    const none = await call('DELETE', '/api/scholarship/applications/current');

    expect(withdrawn.status).toBe(204);
    expect(none.status).toBe(404);
    expect((await none.json()).code).toBe('SCHOLARSHIP_APPLICATION_NOT_FOUND');
  });
});
