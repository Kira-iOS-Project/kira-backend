/**
 * Hapus Tujuan through the real app, the session gate, request validation, the real error mapper
 * and the shared Postgres double answering by statement.
 */

import { beforeEach, describe, expect, test } from 'bun:test';
import { dbControl, resetExternalMocks } from '../../../test/preload.ts';
import { signedIn } from '../../../test/session.ts';
import { GOAL_ID, send } from './helpers.ts';

beforeEach(() => resetExternalMocks());

describe('DELETE /api/goals/{id}', () => {
  test('answers 204 with no body once the goal is deleted', async () => {
    dbControl.respond = signedIn((query) =>
      query.sql.startsWith('delete from "goals"') ? [{ id: GOAL_ID }] : [],
    );
    const res = await send('DELETE', `/api/goals/${GOAL_ID}`);
    expect(res.status).toBe(204);
    expect(await res.text()).toBe('');
  });

  test('answers 404 GOAL_NOT_FOUND for an unknown goal, 422 for a malformed id', async () => {
    dbControl.respond = signedIn();
    const res = await send('DELETE', `/api/goals/${GOAL_ID}`);
    expect(res.status).toBe(404);
    expect((await res.json()).code).toBe('GOAL_NOT_FOUND');
    expect((await send('DELETE', '/api/goals/abc')).status).toBe(422);
  });
});
