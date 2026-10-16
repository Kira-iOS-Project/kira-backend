/**
 * The sign-in limits (SSOT.md § Authentication), as pure decisions the repository runs inside the
 * transaction that writes (auth-codes.repository.ts), so parallel requests cannot all pass them.
 *
 * Code requests: one a minute per address, five an hour per address, twenty an hour per network.
 * Code checks (POST /auth/verify): ten in fifteen minutes per address, enough for two codes' five
 * tries each, and sixty per network, because many people share one address behind a mobile
 * carrier's NAT. A code also allows five tries of its own.
 */

import type { CheckUsage, CodeUsage } from './auth-codes.repository.ts';

const MINUTE_MS = 60_000;
export const RESEND_COOLDOWN_MS = MINUTE_MS;
export const CODE_WINDOW_MS = 60 * MINUTE_MS;
export const CODES_PER_EMAIL = 5;
export const CODES_PER_IP = 20;
export const CHECK_WINDOW_MS = 15 * MINUTE_MS;
export const CHECKS_PER_EMAIL = 10;
export const CHECKS_PER_IP = 60;

/** Why a new code is refused now, or null. */
export function codeRefusal(usage: CodeUsage, now: Date): string | null {
  if (usage.latestAt && now.getTime() - usage.latestAt.getTime() < RESEND_COOLDOWN_MS) {
    return 'resend cooldown';
  }
  if (usage.emailCount >= CODES_PER_EMAIL) return 'address hourly limit';
  return usage.ipCount >= CODES_PER_IP ? 'network hourly limit' : null;
}

/** Why a code check is refused now, or null. */
export function checkRefusal(usage: CheckUsage): string | null {
  if (usage.emailCount >= CHECKS_PER_EMAIL) return 'address check limit';
  return usage.ipCount >= CHECKS_PER_IP ? 'network check limit' : null;
}
