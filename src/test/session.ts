/**
 * A signed-in request for route tests: the bearer header, and a responder that answers the
 * session gate's lookup (`requireSession`) with the test account before handing every other
 * statement to the test's own responder.
 */

import type { FakeResponder } from './fake-postgres.ts';

export const TEST_USER_ID = '0b5c3a1e-5d4f-4c8e-9a51-6f0f2f3c7d11';
export const TEST_SESSION_ID = '7d2f9e14-3b6a-4f0c-8e25-91c4a0b8d6f2';
export const AUTH_HEADER = { Authorization: 'Bearer test-access-token' };

export function signedIn(next: FakeResponder = () => []): FakeResponder {
  return (query) =>
    query.sql.includes('from "sessions"') && query.sql.includes('"access_token_hash" = ')
      ? [{ sessionId: TEST_SESSION_ID, userId: TEST_USER_ID }]
      : next(query);
}
