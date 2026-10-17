import { describe, expect, test } from 'bun:test';
import {
  clientIp,
  codeHash,
  displayNameFromEmail,
  newCode,
  newToken,
  normalizeEmail,
  sameHash,
  tokenHash,
} from '../auth.tokens.ts';

describe('newCode', () => {
  test('is six digits, zero-padded', () => {
    for (let i = 0; i < 50; i += 1) expect(newCode()).toMatch(/^\d{6}$/);
  });
});

describe('newToken', () => {
  test('carries 256 bits as base64url, different each time', () => {
    const token = newToken();
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(newToken()).not.toBe(token);
  });
});

describe('hashes', () => {
  test('a token hash is SHA-256 hex', () => {
    expect(tokenHash('abc')).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
  });

  test('a code hash depends on the address, the code and the secret', () => {
    const base = codeHash('dinda@email.com', '381427', 'secret-a');
    expect(base).toHaveLength(64);
    expect(codeHash('dinda@email.com', '381427', 'secret-b')).not.toBe(base);
    expect(codeHash('bima@email.com', '381427', 'secret-a')).not.toBe(base);
    expect(codeHash('dinda@email.com', '381428', 'secret-a')).not.toBe(base);
  });

  test('sameHash compares equal and unequal digests', () => {
    expect(sameHash('abcd', 'abcd')).toBe(true);
    expect(sameHash('abcd', 'abce')).toBe(false);
    expect(sameHash('abcd', 'abc')).toBe(false);
  });
});

describe('normalizeEmail', () => {
  test('trims and lower-cases', () => {
    expect(normalizeEmail('  Dinda@Email.COM ')).toBe('dinda@email.com');
  });
});

describe('displayNameFromEmail', () => {
  test.each([
    ['dinda@email.com', 'Dinda'],
    ['dinda.putri@email.com', 'Dinda'],
    ['BIMA_99@email.com', 'Bima'],
    ['123@email.com', 'Kamu'],
  ])('%s greets as %s', (email, name) => {
    expect(displayNameFromEmail(email)).toBe(name);
  });
});

describe('clientIp', () => {
  const headers = (values: Record<string, string>) => (name: string) => values[name];

  test('prefers the address Cloudflare reports', () => {
    expect(clientIp(headers({ 'cf-connecting-ip': '1.2.3.4', 'x-forwarded-for': '5.6.7.8' }))).toBe(
      '1.2.3.4',
    );
  });

  test('falls back to the first forwarded hop, then to unknown', () => {
    expect(clientIp(headers({ 'x-forwarded-for': '5.6.7.8, 10.0.0.1' }))).toBe('5.6.7.8');
    expect(clientIp(headers({}))).toBe('unknown');
  });
});
