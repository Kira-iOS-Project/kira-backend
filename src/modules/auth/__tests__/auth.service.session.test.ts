import { describe, expect, test } from 'bun:test';
import { authenticate, refreshSession, signOut } from '../auth.service.ts';
import { tokenHash } from '../auth.tokens.ts';
import { createAuthRepositoryMock, NOW } from './helpers.ts';

const clock = () => NOW;

describe('refreshSession', () => {
  const session = {
    sessionId: 's1',
    userId: 'u1',
    refreshExpiresAt: new Date(NOW.getTime() + 1),
    revokedAt: null,
  };

  test('rotates the pair and remembers the token it replaced', async () => {
    const rotations: unknown[] = [];
    const result = await refreshSession('refresh-1', {
      repository: createAuthRepositoryMock({
        findSessionByRefreshToken: async () => session,
        rotateSession: async (...args) => void rotations.push(args),
      }),
      now: clock,
      makeToken: () => 'next',
    });

    expect(result).toEqual({
      accessToken: 'next',
      refreshToken: 'next',
      accessExpiresInSeconds: 900,
    });
    expect(rotations[0]).toEqual([
      's1',
      expect.objectContaining({ accessTokenHash: tokenHash('next') }),
      tokenHash('refresh-1'),
    ]);
  });

  test('ends the session when a replaced token comes back', async () => {
    const revoked: string[] = [];
    await expect(
      refreshSession('stolen', {
        repository: createAuthRepositoryMock({
          findSessionByPreviousRefreshToken: async () => ({ sessionId: 's1' }),
          revokeSession: async (id) => void revoked.push(id),
        }),
        now: clock,
      }),
    ).rejects.toMatchObject({ statusCode: 401, code: 'AUTH_REFRESH_INVALID' });
    expect(revoked).toEqual(['s1']);
  });

  test.each([
    ['an unknown token', null],
    ['a revoked session', { ...session, revokedAt: NOW }],
    ['an expired refresh token', { ...session, refreshExpiresAt: NOW }],
  ])('refuses %s', async (_label, found) => {
    await expect(
      refreshSession('refresh-1', {
        repository: createAuthRepositoryMock({ findSessionByRefreshToken: async () => found }),
        now: clock,
      }),
    ).rejects.toMatchObject({ code: 'AUTH_REFRESH_INVALID' });
  });
});

describe('authenticate', () => {
  test('resolves a bearer token to its session', async () => {
    const lookups: string[] = [];
    const repository = createAuthRepositoryMock({
      findSessionByAccessToken: async (hash) => {
        lookups.push(hash);
        return { sessionId: 's1', userId: 'u1' };
      },
    });

    expect(await authenticate('Bearer abc', { repository, now: clock })).toEqual({
      sessionId: 's1',
      userId: 'u1',
    });
    expect(lookups).toEqual([tokenHash('abc')]);
  });

  test.each([undefined, '', 'Basic abc', 'Bearer'])('refuses the header %p', async (header) => {
    await expect(
      authenticate(header, { repository: createAuthRepositoryMock(), now: clock }),
    ).rejects.toMatchObject({ statusCode: 401, code: 'AUTH_UNAUTHENTICATED' });
  });

  test('refuses an unknown or expired token', async () => {
    await expect(
      authenticate('Bearer abc', { repository: createAuthRepositoryMock(), now: clock }),
    ).rejects.toMatchObject({ code: 'AUTH_UNAUTHENTICATED' });
  });
});

describe('signOut', () => {
  test('revokes the session now', async () => {
    const revoked: unknown[] = [];
    await signOut('s1', {
      repository: createAuthRepositoryMock({
        revokeSession: async (...args) => void revoked.push(args),
      }),
      now: clock,
    });

    expect(revoked).toEqual([['s1', NOW]]);
  });
});
