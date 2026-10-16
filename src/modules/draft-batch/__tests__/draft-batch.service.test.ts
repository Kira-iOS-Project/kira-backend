import { describe, expect, test } from 'bun:test';
import { DRAFT_STATUS, MESSAGE_KIND } from '../../../lib/constants/chat.ts';
import {
  INCOME_CATEGORY,
  TRANSACTION_SOURCE,
  TRANSACTION_TYPE,
} from '../../../lib/constants/money.ts';
import type { MessageRow } from '../../../lib/chat/chat-message.ts';
import type { CommitPlan } from '../draft-batch.repository.ts';
import { commitDrafts, remainingMoney, UNDO_WINDOW_MS, undoBatch } from '../draft-batch.service.ts';
import {
  BATCH_ID,
  createDraftBatchRepositoryMock,
  createDraftMock,
  createDraftsMessageMock,
  MESSAGE_ID,
  NOW,
  PERSON_ID,
} from './helpers.ts';

const clock = () => NOW;
let ids = 0;
const newId = () => `00000000-0000-4000-8000-${String(++ids).padStart(12, '0')}`;

describe('remainingMoney', () => {
  test('takes the recorded income, else the health-check income', () => {
    expect(
      remainingMoney({
        recordedIncome: 0,
        netMonthlyIncome: 1_888_000,
        spent: 48_000,
        daysLeft: 10,
      }),
    ).toEqual({
      income: 1_888_000,
      spent: 48_000,
      remaining: 1_840_000,
      perDay: 184_000,
    });
    expect(
      remainingMoney({ recordedIncome: 100, netMonthlyIncome: null, spent: 0, daysLeft: 0 }).perDay,
    ).toBe(100);
    expect(
      remainingMoney({ recordedIncome: 0, netMonthlyIncome: null, spent: 7, daysLeft: 2 }),
    ).toMatchObject({
      remaining: -7,
      perDay: -4,
    });
  });
});

describe('commitDrafts', () => {
  test('saves the drafts as one batch and answers with the remaining money', async () => {
    const commits: CommitPlan[] = [];
    const message = createDraftsMessageMock({
      payload: {
        drafts: [
          createDraftMock(),
          createDraftMock({ occurredAt: '2026-09-01T05:00:00.000Z', amount: 999 }),
          createDraftMock({
            type: TRANSACTION_TYPE.income,
            category: INCOME_CATEGORY.bonus,
            amount: 50_000,
          }),
        ],
        draftStatus: DRAFT_STATUS.pending,
      },
    });
    const repository = createDraftBatchRepositoryMock({
      findDraftsMessage: async () => ({ message, sourceKind: MESSAGE_KIND.personText }),
      findBudgetProfile: async () => ({
        payday: { day: 25, endOfMonth: false },
        netMonthlyIncome: 6_000_000,
      }),
      periodTotals: async () => ({ income: 1_000_000, spent: 100_000 }),
      commit: async (_input, plan) => {
        const input = await plan(message.payload);
        if (!input) return null;
        commits.push(input);
        return {
          message: { ...message, payload: input.payload },
          remaining: { ...message, kind: MESSAGE_KIND.remaining, payload: input.remainingPayload },
        };
      },
    });

    const result = await commitDrafts('user-1', MESSAGE_ID, { repository, now: clock, newId });

    const input = commits[0];
    expect(input?.transactions).toHaveLength(3);
    expect(input?.transactions[0]).toMatchObject({
      source: TRANSACTION_SOURCE.chat,
      sourceMessageId: PERSON_ID,
      sourceSpanEnd: 9,
      batchId: result.message.batchId,
    });
    expect(result.message.draftStatus).toBe(DRAFT_STATUS.committed);
    expect(result.message.transactionIds).toEqual(input?.transactions.map((row) => row.id) ?? []);
    expect(result.message.committedAt).toBe(NOW.toISOString());
    /** 1.050.000 income − 125.000 spent; 25 September – 24 October leaves 9 days. */
    expect(result.remaining).toMatchObject({ remaining: 925_000, perDay: 102_777, itemCount: 3 });
  });

  test('saves receipt drafts with the receipt source and the real defaults', async () => {
    const sources: string[] = [];
    const repository = createDraftBatchRepositoryMock({
      findDraftsMessage: async () => ({
        message: createDraftsMessageMock(),
        sourceKind: MESSAGE_KIND.personReceipt,
      }),
      commit: async (_input, plan) => {
        const input = await plan(createDraftsMessageMock().payload);
        sources.push(String(input?.transactions[0]?.source));
        return { message: createDraftsMessageMock(), remaining: createDraftsMessageMock() };
      },
    });

    await commitDrafts('user-1', MESSAGE_ID, { repository });

    expect(sources).toEqual([TRANSACTION_SOURCE.receipt]);
  });

  test('refuses an unknown message, a message without pending drafts, and a lost race', async () => {
    const found = (
      payload = createDraftsMessageMock().payload,
      kind: MessageRow['kind'] = MESSAGE_KIND.drafts,
    ) =>
      createDraftBatchRepositoryMock({
        findDraftsMessage: async () => ({
          message: createDraftsMessageMock({ payload, kind }),
          sourceKind: null,
        }),
      });
    const run = (repository = createDraftBatchRepositoryMock()) =>
      commitDrafts('user-1', MESSAGE_ID, { repository, now: clock, newId });

    await expect(run()).rejects.toMatchObject({ statusCode: 404, code: 'CHAT_MESSAGE_NOT_FOUND' });
    await expect(run(found(undefined, MESSAGE_KIND.noDrafts))).rejects.toMatchObject({
      code: 'CHAT_DRAFTS_NOT_PENDING',
    });
    await expect(
      run(found({ drafts: [createDraftMock()], draftStatus: DRAFT_STATUS.committed })),
    ).rejects.toMatchObject({
      statusCode: 409,
    });
    await expect(run(found({ draftStatus: DRAFT_STATUS.pending }))).rejects.toMatchObject({
      statusCode: 409,
    });
    await expect(run(found())).rejects.toMatchObject({ code: 'CHAT_DRAFTS_NOT_PENDING' });
    const settledMeanwhile = createDraftBatchRepositoryMock({
      findDraftsMessage: async () => ({ message: createDraftsMessageMock(), sourceKind: null }),
      commit: async (_input, plan) =>
        (await plan({ drafts: [createDraftMock()], draftStatus: DRAFT_STATUS.discarded }))
          ? { message: createDraftsMessageMock(), remaining: createDraftsMessageMock() }
          : null,
    });
    await expect(run(settledMeanwhile)).rejects.toMatchObject({ code: 'CHAT_DRAFTS_NOT_PENDING' });
  });
});

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
