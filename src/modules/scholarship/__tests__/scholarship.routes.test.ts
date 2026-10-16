/**
 * The scholarship routes through the real app: the session gate, the real error mapper and the
 * shared Postgres double.
 */

import { beforeEach, describe, expect, test } from 'bun:test';
import { app } from '../../../app.ts';
import { SUBSCRIPTION_SOURCE } from '../../../lib/constants/plans.ts';
import { APPLICATION_STATUS, SCHOLARSHIP_SITUATION } from '../../../lib/constants/scholarship.ts';
import { inOrder } from '../../../test/fake-postgres.ts';
import { dbControl, resetExternalMocks } from '../../../test/preload.ts';
import { AUTH_HEADER, signedIn } from '../../../test/session.ts';

beforeEach(() => resetExternalMocks());

function call(method: string, path: string, body?: unknown) {
  return app.request(path, {
    method,
    headers: { 'Content-Type': 'application/json', ...AUTH_HEADER },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
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
    dbControl.respond = signedIn();

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
    dbControl.respond = signedIn(inOrder([], [], [], [], [], [STORED]));

    const res = await call('POST', '/api/scholarship/applications', {
      situations: [SCHOLARSHIP_SITUATION.chasedByLender],
    });
    const body = await res.json();

    expect(res.status).toBe(201);
    expect(body).toMatchObject({ status: APPLICATION_STATUS.waitlisted, decideBy: '2026-10-21' });
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

  test('DELETE /api/scholarship/applications/current answers 204, or 404 with none', async () => {
    dbControl.respond = signedIn(inOrder([{ id: STORED.id }], []));

    const withdrawn = await call('DELETE', '/api/scholarship/applications/current');
    const none = await call('DELETE', '/api/scholarship/applications/current');

    expect(withdrawn.status).toBe(204);
    expect(none.status).toBe(404);
    expect((await none.json()).code).toBe('SCHOLARSHIP_APPLICATION_NOT_FOUND');
  });
});
