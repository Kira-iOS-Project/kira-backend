import { describe, expect, test } from 'bun:test';
import { createFakeDb, inOrder } from '../../../test/fake-postgres.ts';
import { createAuthRepository } from '../auth.repository.ts';
import { NOW } from './helpers.ts';

const SECRETS = {
  accessTokenHash: 'a'.repeat(64),
  accessExpiresAt: NOW,
  refreshTokenHash: 'r'.repeat(64),
  refreshExpiresAt: NOW,
};

describe('createAuthRepository', () => {
  test('counts the codes of an address and of a network within the window', async () => {
    const fake = createFakeDb(inOrder([{ count: 3 }], []));
    const repository = createAuthRepository(fake.db);

    expect(await repository.countCodesForEmailSince('dinda@email.com', NOW)).toBe(3);
    expect(await repository.countCodesFromIpSince('1.2.3.4', NOW)).toBe(0);
    expect(fake.queries[0]?.sql).toContain('"auth_codes"."email" = $1');
    expect(fake.queries[1]?.sql).toContain('"auth_codes"."request_ip" = $1');
    expect(fake.queries[1]?.params).toEqual(['1.2.3.4', NOW.toISOString()]);
  });

  test('finds when the latest code went out, or null', async () => {
    const fake = createFakeDb(inOrder([{ createdAt: NOW.toISOString() }], []));
    const repository = createAuthRepository(fake.db);

    expect(await repository.latestCodeAt('dinda@email.com')).toEqual(NOW);
    expect(await repository.latestCodeAt('dinda@email.com')).toBeNull();
    expect(fake.queries[0]?.sql).toContain('order by "auth_codes"."created_at" desc limit $2');
  });

  test('retires unused codes and stores the new one in one transaction', async () => {
    const fake = createFakeDb();
    await createAuthRepository(fake.db).replaceCode({
      email: 'dinda@email.com',
      codeHash: 'h'.repeat(64),
      requestIp: '1.2.3.4',
      expiresAt: NOW,
      now: NOW,
    });

    expect(fake.queries.map((query) => query.sql.split(' ')[0])).toEqual(['update', 'insert']);
    expect(fake.queries[0]?.sql).toContain('"consumed_at" is null');
  });

  test('finds the latest unused code, or null', async () => {
    const row = { id: 'code-1', codeHash: 'h', attempts: 2, expiresAt: NOW.toISOString() };
    const fake = createFakeDb(inOrder([row], []));
    const repository = createAuthRepository(fake.db);

    expect(await repository.findActiveCode('dinda@email.com')).toEqual({ ...row, expiresAt: NOW });
    expect(await repository.findActiveCode('dinda@email.com')).toBeNull();
  });

  test('counts a failed attempt and returns the new count', async () => {
    const fake = createFakeDb(inOrder([{ attempts: 3 }], []));
    const repository = createAuthRepository(fake.db);

    expect(await repository.recordFailedAttempt('code-1')).toBe(3);
    expect(await repository.recordFailedAttempt('code-1')).toBe(0);
    expect(fake.queries[0]?.sql).toContain('"attempts" = "auth_codes"."attempts" + 1');
  });

  test('creates the account on a first sign-in and opens a session', async () => {
    const fake = createFakeDb(inOrder([], [{ id: 'user-1', consentedAt: null }], []));
    const result = await createAuthRepository(fake.db).completeSignIn({
      codeId: 'code-1',
      email: 'dinda@email.com',
      displayName: 'Dinda',
      secrets: SECRETS,
      now: NOW,
    });

    expect(result).toEqual({ userId: 'user-1', needsOnboarding: true });
    expect(fake.queries[1]?.sql).toContain('on conflict ("email") do nothing');
    expect(fake.queries[2]?.sql).toStartWith('insert into "sessions"');
  });

  test('finds the existing account when the address is taken', async () => {
    const fake = createFakeDb(
      inOrder([], [], [{ id: 'user-2', consentedAt: NOW.toISOString() }], []),
    );
    const result = await createAuthRepository(fake.db).completeSignIn({
      codeId: 'code-1',
      email: 'dinda@email.com',
      displayName: 'Dinda',
      secrets: SECRETS,
      now: NOW,
    });

    expect(result).toEqual({ userId: 'user-2', needsOnboarding: false });
    expect(fake.queries[2]?.sql).toStartWith('select');
  });

  test('refuses to open a session for an account it can neither create nor find', async () => {
    const fake = createFakeDb();

    await expect(
      createAuthRepository(fake.db).completeSignIn({
        codeId: 'code-1',
        email: 'dinda@email.com',
        displayName: 'Dinda',
        secrets: SECRETS,
        now: NOW,
      }),
    ).rejects.toThrow('The account was neither created nor found');
  });

  test('finds a live session by its access token, or null', async () => {
    const fake = createFakeDb(inOrder([{ sessionId: 's1', userId: 'u1' }], []));
    const repository = createAuthRepository(fake.db);

    expect(await repository.findSessionByAccessToken('a', NOW)).toEqual({
      sessionId: 's1',
      userId: 'u1',
    });
    expect(await repository.findSessionByAccessToken('a', NOW)).toBeNull();
    expect(fake.queries[0]?.sql).toContain('"sessions"."revoked_at" is null');
    expect(fake.queries[0]?.sql).toContain('"sessions"."access_expires_at" > $2');
  });

  test('finds a session by its refresh token or the one it replaced', async () => {
    const row = {
      sessionId: 's1',
      userId: 'u1',
      refreshExpiresAt: NOW.toISOString(),
      revokedAt: null,
    };
    const fake = createFakeDb(inOrder([row], [], [{ sessionId: 's1' }], []));
    const repository = createAuthRepository(fake.db);

    expect(await repository.findSessionByRefreshToken('r')).toEqual({
      ...row,
      refreshExpiresAt: NOW,
    });
    expect(await repository.findSessionByRefreshToken('r')).toBeNull();
    expect(await repository.findSessionByPreviousRefreshToken('p')).toEqual({ sessionId: 's1' });
    expect(await repository.findSessionByPreviousRefreshToken('p')).toBeNull();
  });

  test('rotates and revokes a session', async () => {
    const fake = createFakeDb();
    const repository = createAuthRepository(fake.db);

    await repository.rotateSession('s1', SECRETS, 'old');
    await repository.revokeSession('s1', NOW);

    expect(fake.queries[0]?.sql).toContain('"previous_refresh_token_hash" = $4');
    expect(fake.queries[1]?.sql).toContain('"revoked_at" = $1');
  });
});
