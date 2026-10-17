/**
 * The care routes through the real app: the session gate, request validation, the real error
 * mapper and the shared Postgres double.
 */

import { beforeEach, describe, expect, test } from 'bun:test';
import { app } from '../../../app.ts';
import { env } from '../../../env.ts';
import { CARE_SIGNAL_LEVEL, CARE_SIGNAL_SOURCE } from '../../../lib/constants/care.ts';
import { DEBT_KIND } from '../../../lib/constants/profile.ts';
import { inOrder } from '../../../test/fake-postgres.ts';
import { dbControl, resetExternalMocks } from '../../../test/preload.ts';
import { AUTH_HEADER, signedIn } from '../../../test/session.ts';
import { deriveSafetyPlanKey, seal } from '../care.crypto.ts';
import { SAFETY_PLAN_TEXT_MAX } from '../care.safety-plan.schema.ts';
import { CHECK_IN_ID, createPlan, NOW } from './helpers.ts';

beforeEach(() => resetExternalMocks());

function call(method: string, path: string, body?: unknown) {
  return app.request(path, {
    method,
    headers: { 'Content-Type': 'application/json', ...AUTH_HEADER },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

async function codeOf(res: Response) {
  return { status: res.status, code: (await res.json()).code };
}

const at = NOW.toISOString();

describe('care routes', () => {
  test('refuse a request without a session, on every route', async () => {
    const routes: [string, string][] = [
      ['GET', '/api/care/contacts'],
      ['POST', '/api/care/signals'],
      ['PUT', '/api/care/debt-emergency'],
      ['GET', '/api/debts'],
      ['GET', '/api/care/safety-plan'],
      ['PUT', '/api/care/safety-plan'],
      ['POST', '/api/care/check-ins'],
      ['DELETE', `/api/care/check-ins/${CHECK_IN_ID}`],
      ['GET', '/api/care/check-ins/due'],
      ['POST', `/api/care/check-ins/${CHECK_IN_ID}/seen`],
    ];
    for (const [method, path] of routes) {
      expect((await app.request(path, { method })).status).toBe(401);
    }
  });

  test('GET /api/care/contacts answers the verified list', async () => {
    dbControl.respond = signedIn();
    const res = await call('GET', '/api/care/contacts');
    expect(res.status).toBe(200);
    expect((await res.json()).verifiedOn).toBe('2026-10-01');
  });

  test('POST /api/care/signals stores a level and source, and refuses anything else', async () => {
    dbControl.respond = signedIn();
    const ok = await call('POST', '/api/care/signals', {
      level: CARE_SIGNAL_LEVEL.danger,
      source: CARE_SIGNAL_SOURCE.chat,
    });
    const bad = await call('POST', '/api/care/signals', {
      level: 'panic',
      source: CARE_SIGNAL_SOURCE.chat,
      text: 'x',
    });
    expect(ok.status).toBe(204);
    expect(await codeOf(bad)).toEqual({ status: 422, code: 'VALIDATION_FAILED' });
  });

  test('POST /api/care/check-ins schedules 24, 48 or 72 hours ahead, and refuses other delays', async () => {
    dbControl.respond = signedIn(inOrder([], [{ id: CHECK_IN_ID, dueAt: at }]));
    const ok = await call('POST', '/api/care/check-ins', { afterHours: 24 });
    const bad = await call('POST', '/api/care/check-ins', { afterHours: 12 });
    expect(ok.status).toBe(201);
    expect(await ok.json()).toEqual({ id: CHECK_IN_ID, dueAt: at });
    expect(await codeOf(bad)).toEqual({ status: 422, code: 'VALIDATION_FAILED' });
  });

  test('GET /api/care/check-ins/due answers the due check-in or null', async () => {
    dbControl.respond = signedIn(inOrder([{ id: CHECK_IN_ID, dueAt: at }], []));
    expect(await (await call('GET', '/api/care/check-ins/due')).json()).toEqual({
      checkIn: { id: CHECK_IN_ID, dueAt: at },
    });
    expect(await (await call('GET', '/api/care/check-ins/due')).json()).toEqual({ checkIn: null });
  });

  test('cancel and seen answer 204, CARE_CHECK_IN_NOT_FOUND, or 422 for a malformed id', async () => {
    dbControl.respond = signedIn(inOrder([{ id: CHECK_IN_ID }], [], [{ id: CHECK_IN_ID }], []));
    expect((await call('DELETE', `/api/care/check-ins/${CHECK_IN_ID}`)).status).toBe(204);
    expect(await codeOf(await call('DELETE', `/api/care/check-ins/${CHECK_IN_ID}`))).toEqual({
      status: 404,
      code: 'CARE_CHECK_IN_NOT_FOUND',
    });
    expect((await call('POST', `/api/care/check-ins/${CHECK_IN_ID}/seen`)).status).toBe(204);
    expect(await codeOf(await call('POST', `/api/care/check-ins/${CHECK_IN_ID}/seen`))).toEqual({
      status: 404,
      code: 'CARE_CHECK_IN_NOT_FOUND',
    });
    expect((await call('DELETE', '/api/care/check-ins/not-a-uuid')).status).toBe(422);
  });

  test('PUT /api/care/debt-emergency answers the first activation time it keeps', async () => {
    const first = '2026-10-01T03:00:00.000Z';
    dbControl.respond = signedIn(inOrder([{ activatedAt: first }]));
    const res = await call('PUT', '/api/care/debt-emergency');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ activatedAt: first });
  });

  test('GET /api/debts answers the open debts', async () => {
    const debt = {
      id: 'd1',
      name: 'Kredivo',
      kind: DEBT_KIND.paylater,
      remaining: 1_200_000,
      monthlyInstalment: 300_000,
    };
    dbControl.respond = signedIn(inOrder([debt]));
    expect(await (await call('GET', '/api/debts')).json()).toEqual({ debts: [debt] });
  });

  test('the safety plan: CARE_SAFETY_PLAN_NOT_FOUND before the first save, then the plan', async () => {
    const sealed = await seal(
      await deriveSafetyPlanKey(env.AUTH_SECRET),
      JSON.stringify(createPlan()),
    );
    dbControl.respond = signedIn(
      inOrder([], [{ sealed, updatedAt: at }], [{ sealed, updatedAt: at }]),
    );
    expect(await codeOf(await call('GET', '/api/care/safety-plan'))).toEqual({
      status: 404,
      code: 'CARE_SAFETY_PLAN_NOT_FOUND',
    });
    expect(await (await call('GET', '/api/care/safety-plan')).json()).toEqual({
      ...createPlan(),
      updatedAt: at,
    });
    const saved = await call('PUT', '/api/care/safety-plan', createPlan());
    expect(saved.status).toBe(200);
    expect(await saved.json()).toEqual({ ...createPlan(), updatedAt: at });
  });

  test('PUT /api/care/safety-plan refuses long texts and more than three people', async () => {
    dbControl.respond = signedIn();
    const long = createPlan({ safePlace: 'x'.repeat(SAFETY_PLAN_TEXT_MAX + 1) });
    const person = { name: 'A', phone: '1' };
    const crowded = createPlan({ people: [person, person, person, person] });
    const experts = createPlan({ professionals: [person, person, person, person] });
    for (const body of [long, crowded, experts]) {
      expect(await codeOf(await call('PUT', '/api/care/safety-plan', body))).toEqual({
        status: 422,
        code: 'VALIDATION_FAILED',
      });
    }
  });
});
