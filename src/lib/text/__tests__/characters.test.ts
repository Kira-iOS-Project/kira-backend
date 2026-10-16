import { describe, expect, test } from 'bun:test';
import { characterCount } from '../characters.ts';

describe('characterCount', () => {
  test('counts what a person sees, not UTF-16 units', () => {
    expect(characterCount('')).toBe(0);
    expect(characterCount('Tolong')).toBe(6);
    expect(characterCount('👨‍👩‍👧')).toBe(1);
    expect('👨‍👩‍👧'.length).toBe(8);
    expect(characterCount('👍🏽 ok')).toBe(4);
  });
});
