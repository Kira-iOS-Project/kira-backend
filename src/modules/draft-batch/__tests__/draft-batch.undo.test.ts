import { describe, expect, test } from 'bun:test';
import { DRAFT_STATUS } from '../../../lib/constants/chat.ts';
import { UNDO_WINDOW_MS, undoBatch } from '../draft-batch.service.ts';
import {
  BATCH_ID,
  createDraftBatchRepositoryMock,
  createDraftMock,
  createDraftsMessageMock,
  MESSAGE_ID,
  NOW,
} from './helpers.ts';

const clock = () => NOW;

describe('undoBatch', () => {
  const committed = (committedAt: string | null) =>
    createDraftsMessageMock({
      payload: {
        drafts: [createDraftMock()],
        draftStatus: DRAFT_STATUS.committed,
        batchId: BATCH_ID,
        transactionIds: ['tx-1'],
        committedAt,
      },
    });

  test('puts the drafts back to pending within the window', async () => {
    const message = committed(new Date(NOW.getTime() - UNDO_WINDOW_MS).toISOString());
    const undone: unknown[] = [];
    const repository = createDraftBatchRepositoryMock({
      findBatch: async () => message,
      undo: async (input) => {
        undone.push(input);
        return { ...message, payload: input.payload };
      },
    });

    const result = await undoBatch('user-1', BATCH_ID, { repository, now: clock });

    expect(result).toMatchObject({
      draftStatus: DRAFT_STATUS.pending,
      batchId: null,
      transactionIds: null,
      committedAt: null,
    });
    expect(undone).toEqual([expect.objectContaining({ messageId: MESSAGE_ID, batchId: BATCH_ID })]);
  });

  test('refuses an unknown batch, an expired window and a lost race', async () => {
    const late = committed(new Date(NOW.getTime() - UNDO_WINDOW_MS - 1).toISOString());
    const run = (repository = createDraftBatchRepositoryMock()) =>
      undoBatch('user-1', BATCH_ID, { repository, now: clock });

    await expect(run()).rejects.toMatchObject({
      statusCode: 404,
      code: 'TRANSACTION_BATCH_NOT_FOUND',
    });
    await expect(
      run(createDraftBatchRepositoryMock({ findBatch: async () => late })),
    ).rejects.toMatchObject({
      statusCode: 409,
      code: 'TRANSACTION_UNDO_EXPIRED',
    });
    await expect(
      run(createDraftBatchRepositoryMock({ findBatch: async () => committed(null) })),
    ).rejects.toMatchObject({
      code: 'TRANSACTION_UNDO_EXPIRED',
    });
    await expect(
      run(createDraftBatchRepositoryMock({ findBatch: async () => committed(NOW.toISOString()) })),
    ).rejects.toMatchObject({ code: 'TRANSACTION_BATCH_NOT_FOUND' });
  });

  test('uses the real clock by default', async () => {
    await expect(undoBatch('user-1', BATCH_ID)).rejects.toMatchObject({ statusCode: 404 });
  });
});
