import { describe, expect, test } from 'bun:test';
import { characterCount, isBlank } from '../characters.ts';

describe('characterCount', () => {
  test('counts what a person sees, not UTF-16 units', () => {
    expect(characterCount('')).toBe(0);
    expect(characterCount('Tolong')).toBe(6);
    expect(characterCount('👨‍👩‍👧')).toBe(1);
    expect('👨‍👩‍👧'.length).toBe(8);
    expect(characterCount('👍🏽 ok')).toBe(4);
  });
});

describe('isBlank', () => {
  test('sees whitespace and invisible format characters as nothing', () => {
    for (const blank of [
      '',
      '   ',
      '\n\t',
      '\u200B',
      '\u200C\u200D',
      ' \u2060 ',
      '\uFEFF',
      '\u00AD',
    ]) {
      expect(isBlank(blank)).toBe(true);
    }
    expect(isBlank('\u200Bok')).toBe(false);
    expect(isBlank('👨‍👩‍👧')).toBe(false);
  });
});
