/**
 * Signing in with an email and a one-time code (ONB-05 to ONB-07b), and the sessions that follow.
 * The same code request answers the same way whether or not the address has an account, so the
 * API never tells who uses Kira; the account is created when its owner proves the address.
 */

import { env } from '../../env.ts';
import { type EmailMessage, sendEmail } from '../../lib/email/resend.ts';
import { logger } from '../../lib/server/logger.ts';
import { loginCodeEmail } from './auth.email.ts';
import {
  CodeAttemptsExceededError,
  CodeExpiredError,
  CodeInvalidError,
  CodeRateLimitedError,
  VerifyRateLimitedError,
  EmailDeliveryFailedError,
  RefreshInvalidError,
  UnauthenticatedError,
} from './auth.errors.ts';
import {
  CHECK_WINDOW_MS,
  checkRefusal,
  CODE_WINDOW_MS,
  codeRefusal,
  RESEND_COOLDOWN_MS,
} from './auth.limits.ts';
import { type AuthRepository, authRepository, type SessionSecrets } from './auth.repository.ts';
import type {
  CodeRequestedResponse,
  SessionTokensResponse,
  SignedInResponse,
} from './auth.schema.ts';
import {
  codeHash,
  displayNameFromEmail,
  newCode,
  newToken,
  normalizeEmail,
  sameHash,
  tokenHash,
} from './auth.tokens.ts';

const MINUTE_MS = 60_000;
export const CODE_TTL_MS = 10 * MINUTE_MS;
export const ACCESS_TTL_MS = 15 * MINUTE_MS;
const REFRESH_TTL_MS = 60 * 24 * 60 * MINUTE_MS;
/** Tries one code allows; the limits on requests and checks are in auth.limits.ts. */
export const MAX_ATTEMPTS = 5;

type AuthDeps = {
  repository?: AuthRepository;
  send?: (message: EmailMessage) => Promise<void>;
  now?: () => Date;
  secret?: string;
  makeCode?: () => string;
  makeToken?: () => string;
};

function resolve(deps: AuthDeps) {
  return {
    repository: deps.repository ?? authRepository,
    send: deps.send ?? sendEmail,
    now: deps.now?.() ?? new Date(),
    secret: deps.secret ?? env.AUTH_SECRET,
    makeCode: deps.makeCode ?? newCode,
    makeToken: deps.makeToken ?? newToken,
  };
}

function issueTokens(now: Date, makeToken: () => string) {
  const accessToken = makeToken();
  const refreshToken = makeToken();
  const secrets: SessionSecrets = {
    accessTokenHash: tokenHash(accessToken),
    accessExpiresAt: new Date(now.getTime() + ACCESS_TTL_MS),
    refreshTokenHash: tokenHash(refreshToken),
    refreshExpiresAt: new Date(now.getTime() + REFRESH_TTL_MS),
  };
  const tokens: SessionTokensResponse = {
    accessToken,
    refreshToken,
    accessExpiresInSeconds: ACCESS_TTL_MS / 1000,
  };
  return { secrets, tokens };
}

/** Sends a new six-digit code to the address, retiring any earlier one. */
export async function requestCode(
  input: { email: string; ip: string },
  deps: AuthDeps = {},
): Promise<CodeRequestedResponse> {
  const { repository, send, now, secret, makeCode } = resolve(deps);
  const email = normalizeEmail(input.email);
  const code = makeCode();
  const refusal = await repository.issueCode(
    {
      email,
      ip: input.ip,
      codeHash: codeHash(email, code, secret),
      expiresAt: new Date(now.getTime() + CODE_TTL_MS),
      now,
      since: new Date(now.getTime() - CODE_WINDOW_MS),
    },
    (usage) => codeRefusal(usage, now),
  );
  if (refusal !== null) throw new CodeRateLimitedError(refusal);
  try {
    await send(loginCodeEmail({ to: email, code, name: displayNameFromEmail(email) }));
  } catch (err) {
    logger.error({ err }, 'Sign-in code email failed');
    throw new EmailDeliveryFailedError('sign-in code');
  }
  return { expiresInSeconds: CODE_TTL_MS / 1000, resendAfterSeconds: RESEND_COOLDOWN_MS / 1000 };
}

/**
 * Checks the code and signs the address in, creating its account the first time. The check is
 * counted against the address's and the network's limits first, and a try of the code is claimed
 * before comparing, so parallel guesses get the code's five tries and no more.
 */
export async function verifyCode(
  input: { email: string; code: string; ip: string },
  deps: AuthDeps = {},
): Promise<SignedInResponse> {
  const { repository, now, secret, makeToken } = resolve(deps);
  const email = normalizeEmail(input.email);
  const refusal = await repository.recordCheck(
    { email, ip: input.ip, since: new Date(now.getTime() - CHECK_WINDOW_MS) },
    checkRefusal,
  );
  if (refusal !== null) throw new VerifyRateLimitedError(refusal);
  const active = await repository.findActiveCode(email);
  if (!active) throw new CodeInvalidError();
  if (active.expiresAt.getTime() <= now.getTime()) throw new CodeExpiredError();
  const claim = await repository.claimAttempt(active.id, now, MAX_ATTEMPTS);
  if (!claim) throw new CodeAttemptsExceededError();
  if (!sameHash(codeHash(email, input.code, secret), claim.codeHash)) {
    throw claim.attempts >= MAX_ATTEMPTS ? new CodeAttemptsExceededError() : new CodeInvalidError();
  }
  const { secrets, tokens } = issueTokens(now, makeToken);
  const { needsOnboarding } = await repository.completeSignIn({
    codeId: active.id,
    email,
    displayName: displayNameFromEmail(email),
    secrets,
    now,
  });
  return { ...tokens, needsOnboarding };
}

/**
 * Trades a refresh token for a new pair. A refresh token that was already traded ends its session:
 * only a copy held by someone else is ever presented twice. Two trades of one token racing count
 * the same way: the rotation is conditional, and the one that loses revokes the session.
 */
export async function refreshSession(
  refreshToken: string,
  deps: AuthDeps = {},
): Promise<SessionTokensResponse> {
  const { repository, now, makeToken } = resolve(deps);
  const hash = tokenHash(refreshToken);
  const session = await repository.findSessionByRefreshToken(hash);
  if (!session) {
    const reused = await repository.findSessionByPreviousRefreshToken(hash);
    if (reused) await repository.revokeSession(reused.sessionId, now);
    throw new RefreshInvalidError(reused ? 'reused' : 'unknown');
  }
  if (session.revokedAt) throw new RefreshInvalidError('revoked');
  if (session.refreshExpiresAt.getTime() <= now.getTime()) throw new RefreshInvalidError('expired');
  const { secrets, tokens } = issueTokens(now, makeToken);
  if (!(await repository.rotateSession(session.sessionId, secrets, hash))) {
    await repository.revokeSession(session.sessionId, now);
    throw new RefreshInvalidError('reused');
  }
  return tokens;
}

/** The session a bearer token belongs to, or a 401. */
export async function authenticate(
  authorization: string | undefined,
  deps: AuthDeps = {},
): Promise<{ userId: string; sessionId: string }> {
  const { repository, now } = resolve(deps);
  const token = /^Bearer (\S+)$/.exec(authorization ?? '')?.[1];
  if (!token) throw new UnauthenticatedError('no bearer token');
  const session = await repository.findSessionByAccessToken(tokenHash(token), now);
  if (!session) throw new UnauthenticatedError('unknown, revoked or expired token');
  return session;
}

export async function signOut(sessionId: string, deps: AuthDeps = {}): Promise<void> {
  const { repository, now } = resolve(deps);
  await repository.revokeSession(sessionId, now);
}
