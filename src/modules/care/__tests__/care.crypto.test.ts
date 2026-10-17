import { describe, expect, test } from 'bun:test';
import { deriveSafetyPlanKey, open, seal } from '../care.crypto.ts';
import { testKey } from './helpers.ts';

describe('care crypto', () => {
  test('seals with a fresh IV each time and opens back to the same text', async () => {
    const key = await testKey();
    const first = await seal(key, 'rahasia');
    const second = await seal(key, 'rahasia');

    expect(first).toStartWith('v1.');
    expect(first).not.toBe(second);
    expect(first).not.toContain('rahasia');
    expect(await open(key, first)).toBe('rahasia');
  });

  test('refuses another key, a changed body and a malformed value', async () => {
    const key = await testKey();
    const other = await deriveSafetyPlanKey('another-secret-of-at-least-32-characters');
    const sealed = await seal(key, 'rahasia');
    const [version, iv, body = ''] = sealed.split('.');
    const flipped = `${version}.${iv}.${body.startsWith('A') ? 'B' : 'A'}${body.slice(1)}`;

    await expect(open(other, sealed)).rejects.toThrow();
    await expect(open(key, flipped)).rejects.toThrow();
    await expect(open(key, 'v2.a.b')).rejects.toThrow('Not a sealed safety plan');
    await expect(open(key, 'v1.only')).rejects.toThrow('Not a sealed safety plan');
  });
});
