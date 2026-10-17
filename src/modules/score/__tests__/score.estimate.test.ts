import { describe, expect, test } from 'bun:test';
import { estimatePayingOff } from '../score.estimate.ts';
import { createScoreRepositoryMock, DINDA_DEBTS } from './helpers.ts';

describe('estimatePayingOff', () => {
  test('scores Dinda with and without her first paylater account', async () => {
    const estimate = await estimatePayingOff('user-1', DINDA_DEBTS[0]!, {
      repository: createScoreRepositoryMock(),
    });
    expect(estimate?.before).toBeLessThanOrEqual(estimate?.after ?? 0);
  });

  test('is null before the health check, or for an account that is not open', async () => {
    const none = createScoreRepositoryMock({ findState: async () => null });
    expect(await estimatePayingOff('user-1', DINDA_DEBTS[0]!, { repository: none })).toBeNull();
    const stranger = { ...DINDA_DEBTS[0]!, name: 'Lain' };
    expect(
      await estimatePayingOff('user-1', stranger, { repository: createScoreRepositoryMock() }),
    ).toBeNull();
  });
});
