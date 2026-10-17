import { describe, expect, test } from 'bun:test';
import { ladderOf, prefillOf } from '../plan.ladder.ts';

describe('the ladder and prefill before they read the score', () => {
  test('every step is ahead and every figure unknown', async () => {
    expect((await ladderOf('user-1')).map((step) => step.status)).toEqual([
      'todo',
      'todo',
      'todo',
      'todo',
    ]);
    expect(Object.values(await prefillOf('user-1'))).toEqual([null, null, null, null, null]);
  });
});
