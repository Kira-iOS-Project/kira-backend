/**
 * The secrets of signing in: the six-digit code, the bearer and refresh tokens, and how each is
 * stored. Tokens carry 256 random bits, so a plain SHA-256 is enough at rest; a code has only a
 * million values, so it is stored as an HMAC under AUTH_SECRET, which a leaked table does not hold.
 */

import { createHash, createHmac, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';

export function newCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, '0');
}

export function newToken(): string {
  return randomBytes(32).toString('base64url');
}

export function tokenHash(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function codeHash(email: string, code: string, secret: string): string {
  return createHmac('sha256', secret).update(`${email}:${code}`).digest('hex');
}

/** Compares two hex digests in constant time. */
export function sameHash(a: string, b: string): boolean {
  return a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

/** One address, one account: compare and store addresses lower-cased and trimmed. */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * The name Kira greets someone by, from the start of their address: "dinda@email.com" is Dinda,
 * "dinda.putri@email.com" is Dinda too. No screen asks for a name (ONB-05 signs up by email only).
 */
export function displayNameFromEmail(email: string): string {
  const word = /^[\p{L}]+/u.exec(email)?.[0] ?? 'Kamu';
  return (word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()).slice(0, 60);
}

/** The caller's address as Cloudflare reports it, falling back to the first forwarded hop. */
export function clientIp(header: (name: string) => string | undefined): string {
  const forwarded = header('x-forwarded-for')?.split(',')[0]?.trim();
  return (header('cf-connecting-ip') ?? forwarded ?? 'unknown').slice(0, 64);
}
