/**
 * PR-blocking: the sign-in limits hold under a burst of parallel requests (review findings 1, 6
 * and 7). Each test runs the real service over the real repository and the fake Postgres, whose
 * responder keeps the rows and answers each statement atomically, as Postgres does, and whose
 * transactions run one at a time, as the advisory locks make them.
 */

import { describe, expect, test } from 'bun:test';
import { createFakeDb, type FakeQuery, type FakeRow } from '../../../test/fake-postgres.ts';
import { CHECKS_PER_EMAIL } from '../auth.limits.ts';
import { createAuthRepository } from '../auth.repository.ts';
import { MAX_ATTEMPTS, refreshSession, requestCode, verifyCode } from '../auth.service.ts';
import { codeHash, tokenHash } from '../auth.tokens.ts';
import { NOW } from './helpers.ts';

/** A test-only HMAC key: any 32+ characters do; low entropy keeps secret scanners quiet. */
const SECRET = 'k'.repeat(40);
const EMAIL = 'victim@email.com';
const clock = () => NOW;

/** A one-address sign-in table: its codes, its checks, and the tries the live code has had. */
function signInDatabase(right: string) {
  const state = { codes: 0, checks: 0, attempts: 0, sent: 0 };
  const respond = (query: FakeQuery): FakeRow[] => {
    const { sql } = query;
    if (sql.startsWith('select count(*)') && sql.includes('"sign_in_attempts"')) {
      return [{ count: sql.includes('"email" =') ? state.checks : 0 }];
    }
    if (sql.startsWith('insert into "sign_in_attempts"')) return (void state.checks++, []);
    if (sql.startsWith('select "created_at" from "auth_codes"')) {
      return state.codes > 0 ? [{ createdAt: NOW.toISOString() }] : [];
    }
    if (sql.startsWith('select count(*)') && sql.includes('"auth_codes"'))
      return [{ count: state.codes }];
    if (sql.startsWith('insert into "auth_codes"')) return (void state.codes++, []);
    if (sql.startsWith('select "id", "code_hash"')) {
      const expiresAt = new Date(NOW.getTime() + 60_000).toISOString();
      return [
        {
          id: 'code-1',
          codeHash: codeHash(EMAIL, right, SECRET),
          attempts: state.attempts,
          expiresAt,
        },
      ];
    }
    if (sql.startsWith('update "auth_codes" set "attempts"')) {
      if (state.attempts >= MAX_ATTEMPTS) return [];
      state.attempts += 1;
      return [{ codeHash: codeHash(EMAIL, right, SECRET), attempts: state.attempts }];
    }
    if (sql.startsWith('insert into "users"')) return [{ id: 'victim', consentedAt: null }];
    return [];
  };
  const fake = createFakeDb(respond, { serialTransactions: true });
  return { state, repository: createAuthRepository(fake.db) };
}

const codes = (from: number, total: number) =>
  Array.from({ length: total }, (_, index) => String(from + index).padStart(6, '0'));

async function settle(calls: Promise<unknown>[]) {
  const results = await Promise.allSettled(calls);
  const codesOf = (result: PromiseSettledResult<unknown>) =>
    result.status === 'rejected' ? (result.reason as { code?: string }).code : 'SIGNED_IN';
  return results.map(codesOf);
}

describe('finding 1: code checks', () => {
  test('a burst of 200 guesses gets ten checks and five tries, and never signs in', async () => {
    const { state, repository } = signInDatabase('000150');
    const deps = { repository, now: clock, secret: SECRET, makeToken: () => 't' };

    const outcomes = await settle(
      codes(0, 200).map((code, index) =>
        verifyCode({ email: EMAIL, code, ip: `10.0.0.${index % 250}` }, deps),
      ),
    );

    expect(outcomes.filter((code) => code === 'SIGNED_IN')).toEqual([]);
    expect(state.checks).toBe(CHECKS_PER_EMAIL);
    expect(state.attempts).toBe(MAX_ATTEMPTS);
    expect(outcomes.filter((code) => code === 'AUTH_CODE_RATE_LIMITED')).toHaveLength(190);
  });

  test('with the check limit out of the way, tries past the fifth are refused before comparing', async () => {
    const { state, repository } = signInDatabase('000007');
    const roomy = { ...repository, recordCheck: async () => null };
    const deps = { repository: roomy, now: clock, secret: SECRET, makeToken: () => 't' };

    const outcomes = await settle(
      codes(0, 50).map((code) => verifyCode({ email: EMAIL, code, ip: 'x' }, deps)),
    );

    expect(state.attempts).toBe(MAX_ATTEMPTS);
    expect(outcomes.filter((code) => code === 'SIGNED_IN')).toEqual([]);
    expect(outcomes.filter((code) => code === 'AUTH_CODE_ATTEMPTS_EXCEEDED')).toHaveLength(46);
  });
});

describe('finding 7: code requests', () => {
  test('a burst of 30 requests for one address issues one code and sends one email', async () => {
    const { state, repository } = signInDatabase('000000');

    const outcomes = await settle(
      Array.from({ length: 30 }, () =>
        requestCode(
          { email: EMAIL, ip: '1.2.3.4' },
          { repository, now: clock, secret: SECRET, send: async () => void state.sent++ },
        ),
      ),
    );

    expect(state.codes).toBe(1);
    expect(state.sent).toBe(1);
    expect(outcomes.filter((code) => code === 'AUTH_CODE_RATE_LIMITED')).toHaveLength(29);
  });
});

describe('finding 6: refresh rotation', () => {
  test('two refreshes of one token: one gets the pair, the other revokes the session', async () => {
    const session = { current: tokenHash('stolen-or-retried'), revoked: false };
    const respond = (query: FakeQuery): FakeRow[] => {
      const { sql, params } = query;
      if (sql.includes('where "sessions"."refresh_token_hash" = $1 limit')) {
        return params[0] === session.current
          ? [
              {
                sessionId: 's1',
                userId: 'u1',
                refreshExpiresAt: '2099-01-01T00:00:00.000Z',
                revokedAt: null,
              },
            ]
          : [];
      }
      if (sql.startsWith('update "sessions" set "access_token_hash"')) {
        if (session.revoked || !params.includes(session.current)) return [];
        session.current = String(params[2]);
        return [{ id: 's1' }];
      }
      if (sql.startsWith('update "sessions" set "revoked_at"'))
        return (void (session.revoked = true), []);
      return [];
    };
    const repository = createAuthRepository(createFakeDb(respond).db);
    let n = 0;
    const deps = { repository, now: clock, makeToken: () => `token-${(n += 1)}` };

    const outcomes = await settle([
      refreshSession('stolen-or-retried', deps),
      refreshSession('stolen-or-retried', deps),
    ]);

    expect(outcomes.toSorted((left, right) => String(left).localeCompare(String(right)))).toEqual([
      'AUTH_REFRESH_INVALID',
      'SIGNED_IN',
    ]);
    expect(session.revoked).toBe(true);
  });
});
