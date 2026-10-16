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

  test('rotates a session only from its current refresh token, and revokes', async () => {
    const fake = createFakeDb(inOrder([{ id: 's1' }], [], []));
    const repository = createAuthRepository(fake.db);

    expect(await repository.rotateSession('s1', SECRETS, 'old')).toBe(true);
    expect(await repository.rotateSession('s1', SECRETS, 'old')).toBe(false);
    await repository.revokeSession('s1', NOW);
    expect(fake.queries[0]?.sql).toContain('"refresh_token_hash" = $');
    expect(fake.queries[0]?.sql).toContain('"revoked_at" is null');
    expect(fake.queries[2]?.sql).toStartWith('update "sessions" set "revoked_at"');
  });
});
