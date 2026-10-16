import { describe, expect, test } from 'bun:test';
import type { EmailMessage } from '../../../lib/email/resend.ts';
import { CODE_WINDOW_MS } from '../auth.limits.ts';
import {
  ACCESS_TTL_MS,
  CODE_TTL_MS,
  MAX_ATTEMPTS,
  requestCode,
  verifyCode,
} from '../auth.service.ts';
import { codeHash, tokenHash } from '../auth.tokens.ts';
import { createAuthRepositoryMock, NOW } from './helpers.ts';

const SECRET = 'test-secret-that-is-long-enough-000000';
const clock = () => NOW;

describe('requestCode', () => {
  test('issues the hashed code for the normalised address and emails it', async () => {
    const issued: unknown[] = [];
    const sent: EmailMessage[] = [];
    const result = await requestCode(
      { email: ' Dinda@Email.com ', ip: '1.2.3.4' },
      {
        repository: createAuthRepositoryMock({
          issueCode: async (input, decide) => {
            issued.push(input);
            return decide({ latestAt: null, emailCount: 0, ipCount: 0 });
          },
        }),
        send: async (message) => void sent.push(message),
        now: clock,
        secret: SECRET,
        makeCode: () => '381427',
      },
    );

    expect(result).toEqual({ expiresInSeconds: 600, resendAfterSeconds: 60 });
    expect(issued).toEqual([
      {
        email: 'dinda@email.com',
        ip: '1.2.3.4',
        codeHash: codeHash('dinda@email.com', '381427', SECRET),
        expiresAt: new Date(NOW.getTime() + CODE_TTL_MS),
        now: NOW,
        since: new Date(NOW.getTime() - CODE_WINDOW_MS),
      },
    ]);
    expect(sent[0]?.subject).toBe('381427 adalah kode masuk Kira');
    expect(sent[0]?.to).toBe('dinda@email.com');
    expect(sent[0]?.html).toContain('Hai Dinda');
  });

  test('refuses with 429 and sends nothing when the repository reports a limit', async () => {
    const sent: EmailMessage[] = [];
    const repository = createAuthRepositoryMock({
      issueCode: async (_input, decide) => decide({ latestAt: NOW, emailCount: 0, ipCount: 0 }),
    });

    await expect(
      requestCode(
        { email: 'dinda@email.com', ip: '1.2.3.4' },
        { repository, now: clock, send: async (message) => void sent.push(message) },
      ),
    ).rejects.toMatchObject({ statusCode: 429, code: 'AUTH_CODE_RATE_LIMITED' });
    expect(sent).toEqual([]);
  });

  test('answers 503 when Resend refuses the email', async () => {
    await expect(
      requestCode(
        { email: 'dinda@email.com', ip: '1.2.3.4' },
        {
          repository: createAuthRepositoryMock(),
          now: clock,
          send: async () => {
            throw new Error('Resend answered 500');
          },
        },
      ),
    ).rejects.toMatchObject({ statusCode: 503, code: 'EMAIL_DELIVERY_FAILED' });
  });
});

describe('verifyCode', () => {
  const active = {
    id: 'code-1',
    codeHash: codeHash('dinda@email.com', '381427', SECRET),
    attempts: 0,
    expiresAt: new Date(NOW.getTime() + 60_000),
  };
  const claimed =
    (attempts = 1) =>
    async () => ({ codeHash: active.codeHash, attempts });
  const input = (code: string) => ({ email: 'dinda@email.com', code, ip: '1.2.3.4' });
  const deps = (overrides = {}) => ({
    repository: createAuthRepositoryMock({
      findActiveCode: async () => active,
      claimAttempt: claimed(),
      ...overrides,
    }),
    now: clock,
    secret: SECRET,
    makeToken: (() => {
      let n = 0;
      return () => `token-${(n += 1)}`;
    })(),
  });

  test('signs in with the right code and returns both tokens', async () => {
    const signIns: unknown[] = [];
    const result = await verifyCode(
      { ...input('381427'), email: 'Dinda@email.com' },
      deps({
        completeSignIn: async (signIn: unknown) => {
          signIns.push(signIn);
          return { userId: 'user-1', needsOnboarding: false };
        },
      }),
    );

    expect(result).toEqual({
      accessToken: 'token-1',
      refreshToken: 'token-2',
      accessExpiresInSeconds: ACCESS_TTL_MS / 1000,
      needsOnboarding: false,
    });
    expect(signIns[0]).toMatchObject({
      codeId: 'code-1',
      email: 'dinda@email.com',
      displayName: 'Dinda',
      secrets: { accessTokenHash: tokenHash('token-1'), refreshTokenHash: tokenHash('token-2') },
    });
  });

  test('accepts the right code on its last try', async () => {
    const result = await verifyCode(input('381427'), deps({ claimAttempt: claimed(MAX_ATTEMPTS) }));
    expect(result.accessToken).toBe('token-1');
  });

  test('refuses with 429 before looking at the code when the check limit is reached', async () => {
    let looked = false;
    await expect(
      verifyCode(
        input('381427'),
        deps({
          recordCheck: async (_input: unknown, decide: (usage: object) => string | null) =>
            decide({ emailCount: 10, ipCount: 0 }),
          findActiveCode: async () => {
            looked = true;
            return active;
          },
        }),
      ),
    ).rejects.toMatchObject({ statusCode: 429, code: 'AUTH_CODE_RATE_LIMITED' });
    expect(looked).toBe(false);
  });

  test('refuses when no code is waiting for the address', async () => {
    await expect(
      verifyCode(input('381427'), deps({ findActiveCode: async () => null })),
    ).rejects.toMatchObject({ statusCode: 400, code: 'AUTH_CODE_INVALID' });
  });

  test('refuses an expired code', async () => {
    await expect(
      verifyCode(
        input('381427'),
        deps({ findActiveCode: async () => ({ ...active, expiresAt: NOW }) }),
      ),
    ).rejects.toMatchObject({ code: 'AUTH_CODE_EXPIRED' });
  });

  test('refuses without comparing when no try can be claimed', async () => {
    await expect(
      verifyCode(input('381427'), deps({ claimAttempt: async () => null })),
    ).rejects.toMatchObject({ statusCode: 429, code: 'AUTH_CODE_ATTEMPTS_EXCEEDED' });
  });

  test('says a wrong code is wrong, and ends the code on its fifth wrong try', async () => {
    await expect(verifyCode(input('000000'), deps())).rejects.toMatchObject({
      code: 'AUTH_CODE_INVALID',
    });
    await expect(
      verifyCode(input('000000'), deps({ claimAttempt: claimed(MAX_ATTEMPTS) })),
    ).rejects.toMatchObject({ code: 'AUTH_CODE_ATTEMPTS_EXCEEDED' });
  });
});
