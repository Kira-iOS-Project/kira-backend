import { describe, expect, test } from 'bun:test';
import type { EmailMessage } from '../../../lib/email/resend.ts';
import {
  ACCESS_TTL_MS,
  CODE_TTL_MS,
  MAX_ATTEMPTS,
  requestCode,
  RESEND_COOLDOWN_MS,
  verifyCode,
} from '../auth.service.ts';
import { codeHash, tokenHash } from '../auth.tokens.ts';
import { createAuthRepositoryMock, NOW } from './helpers.ts';

const SECRET = 'test-secret-that-is-long-enough-000000';
const clock = () => NOW;

describe('requestCode', () => {
  test('stores the hashed code for the normalised address and emails the code', async () => {
    const stored: unknown[] = [];
    const sent: EmailMessage[] = [];
    const result = await requestCode(
      { email: ' Dinda@Email.com ', ip: '1.2.3.4' },
      {
        repository: createAuthRepositoryMock({
          replaceCode: async (input) => void stored.push(input),
        }),
        send: async (message) => void sent.push(message),
        now: clock,
        secret: SECRET,
        makeCode: () => '381427',
      },
    );

    expect(result).toEqual({ expiresInSeconds: 600, resendAfterSeconds: 60 });
    expect(stored).toEqual([
      {
        email: 'dinda@email.com',
        codeHash: codeHash('dinda@email.com', '381427', SECRET),
        requestIp: '1.2.3.4',
        expiresAt: new Date(NOW.getTime() + CODE_TTL_MS),
        now: NOW,
      },
    ]);
    expect(sent[0]?.subject).toBe('381427 adalah kode masuk Kira');
    expect(sent[0]?.to).toBe('dinda@email.com');
    expect(sent[0]?.html).toContain('Hai Dinda');
  });

  test('refuses a second code inside the resend cooldown', async () => {
    const repository = createAuthRepositoryMock({
      latestCodeAt: async () => new Date(NOW.getTime() - RESEND_COOLDOWN_MS + 1),
    });

    await expect(
      requestCode({ email: 'dinda@email.com', ip: '1.2.3.4' }, { repository, now: clock }),
    ).rejects.toMatchObject({ statusCode: 429, code: 'AUTH_CODE_RATE_LIMITED' });
  });

  test('allows a code once the cooldown has passed', async () => {
    const repository = createAuthRepositoryMock({
      latestCodeAt: async () => new Date(NOW.getTime() - RESEND_COOLDOWN_MS),
    });

    expect(
      await requestCode(
        { email: 'dinda@email.com', ip: '1.2.3.4' },
        { repository, now: clock, send: async () => undefined },
      ),
    ).toMatchObject({ resendAfterSeconds: 60 });
  });

  test('refuses a sixth code for one address within the hour', async () => {
    const repository = createAuthRepositoryMock({ countCodesForEmailSince: async () => 5 });

    await expect(
      requestCode({ email: 'dinda@email.com', ip: '1.2.3.4' }, { repository, now: clock }),
    ).rejects.toMatchObject({ code: 'AUTH_CODE_RATE_LIMITED' });
  });

  test('refuses a twenty-first code from one network within the hour', async () => {
    const repository = createAuthRepositoryMock({ countCodesFromIpSince: async () => 20 });

    await expect(
      requestCode({ email: 'dinda@email.com', ip: '1.2.3.4' }, { repository, now: clock }),
    ).rejects.toMatchObject({ code: 'AUTH_CODE_RATE_LIMITED' });
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
  const deps = (overrides = {}) => ({
    repository: createAuthRepositoryMock({ findActiveCode: async () => active, ...overrides }),
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
      { email: 'Dinda@email.com', code: '381427' },
      deps({
        completeSignIn: async (input: unknown) => {
          signIns.push(input);
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

  test('refuses when no code is waiting for the address', async () => {
    await expect(
      verifyCode(
        { email: 'dinda@email.com', code: '381427' },
        deps({ findActiveCode: async () => null }),
      ),
    ).rejects.toMatchObject({ statusCode: 400, code: 'AUTH_CODE_INVALID' });
  });

  test('refuses an expired code', async () => {
    await expect(
      verifyCode(
        { email: 'dinda@email.com', code: '381427' },
        deps({ findActiveCode: async () => ({ ...active, expiresAt: NOW }) }),
      ),
    ).rejects.toMatchObject({ code: 'AUTH_CODE_EXPIRED' });
  });

  test('refuses a code that has used up its tries', async () => {
    await expect(
      verifyCode(
        { email: 'dinda@email.com', code: '381427' },
        deps({ findActiveCode: async () => ({ ...active, attempts: MAX_ATTEMPTS }) }),
      ),
    ).rejects.toMatchObject({ statusCode: 429, code: 'AUTH_CODE_ATTEMPTS_EXCEEDED' });
  });

  test('counts a wrong code and says so', async () => {
    const failed: string[] = [];
    await expect(
      verifyCode(
        { email: 'dinda@email.com', code: '000000' },
        deps({
          recordFailedAttempt: async (id: string) => {
            failed.push(id);
            return 1;
          },
        }),
      ),
    ).rejects.toMatchObject({ code: 'AUTH_CODE_INVALID' });
    expect(failed).toEqual(['code-1']);
  });

  test('ends the code on its fifth wrong try', async () => {
    await expect(
      verifyCode(
        { email: 'dinda@email.com', code: '000000' },
        deps({ recordFailedAttempt: async () => MAX_ATTEMPTS }),
      ),
    ).rejects.toMatchObject({ code: 'AUTH_CODE_ATTEMPTS_EXCEEDED' });
  });
});
