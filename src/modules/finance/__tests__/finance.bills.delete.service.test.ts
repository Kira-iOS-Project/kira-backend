import { describe, expect, test } from 'bun:test';
import { deleteBill } from '../finance.bills.service.ts';

const BILL_ID = '00000000-0000-4000-8000-000000000001';

describe('deleteBill', () => {
  test('returns after cancelling the owner schedule', async () => {
    await expect(
      deleteBill('owner', BILL_ID, {
        repository: {
          deleteBill: async (userId, id) => {
            expect(userId).toBe('owner');
            expect(id).toBe(BILL_ID);
            return true;
          },
        },
      }),
    ).resolves.toBeUndefined();
  });

  test('uses the bill not found error for missing, archived, or unowned schedules', async () => {
    await expect(
      deleteBill('owner', BILL_ID, { repository: { deleteBill: async () => false } }),
    ).rejects.toMatchObject({ code: 'BILL_NOT_FOUND', statusCode: 404 });
  });
});
