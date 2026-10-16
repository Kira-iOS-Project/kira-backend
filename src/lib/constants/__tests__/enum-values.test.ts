import { describe, expect, test } from 'bun:test';
import { enumValues } from '../enum-values.ts';
import { FOCUS } from '../profile.ts';

describe('enumValues', () => {
  test('lists the values in declaration order', () => {
    expect(enumValues(FOCUS)).toEqual([FOCUS.trackSpending, FOCUS.debtFree]);
  });

  test('refuses an empty vocabulary', () => {
    expect(() => enumValues({})).toThrow('A vocabulary needs at least one value');
  });
});
