import { describe, expect, test } from 'bun:test';
import { DRAFT_STATUS, MESSAGE_KIND, MESSAGE_SENDER } from '../../../lib/constants/chat.ts';
import {
  EXPENSE_CATEGORY,
  TRANSACTION_SOURCE,
  TRANSACTION_TYPE,
} from '../../../lib/constants/money.ts';
import { createFakeDb, inOrder } from '../../../test/fake-postgres.ts';
import { createDraftBatchRepository } from '../draft-batch.repository.ts';
import { BATCH_ID, createDraftsMessageMock, MESSAGE_ID, NOW } from './helpers.ts';

const message = createDraftsMessageMock();
const row = { ...message, createdAt: message.createdAt.toISOString() };

describe('createDraftBatchRepository', () => {
  test('finds a reply with the kind of the message it answers, or null', async () => {
    const fake = createFakeDb(inOrder([{ ...row, sourceKind: MESSAGE_KIND.personReceipt }], []));
    const repository = createDraftBatchRepository(fake.db);

    expect(await repository.findDraftsMessage('user-1', MESSAGE_ID)).toEqual({
      message,
      sourceKind: MESSAGE_KIND.personReceipt,
    });
    expect(await repository.findDraftsMessage('user-1', MESSAGE_ID)).toBeNull();
    expect(fake.queries[0]?.sql).toContain('left join "chat_messages" "source"');
  });

  test('reads the payday and the health-check income, with defaults', async () => {
    const fake = createFakeDb(
      inOrder([{ day: 25, endOfMonth: false, netMonthlyIncome: 6_000_000 }], []),
    );
    const repository = createDraftBatchRepository(fake.db);

    expect(await repository.findBudgetProfile('user-1')).toEqual({
      payday: { day: 25, endOfMonth: false },
      netMonthlyIncome: 6_000_000,
    });
    expect(await repository.findBudgetProfile('user-1')).toEqual({
      payday: { day: null, endOfMonth: false },
      netMonthlyIncome: null,
    });
  });

  test('sums the income and spending of a period', async () => {
    const fake = createFakeDb(inOrder([{ income: '6000000', spent: '48000' }], []));
    const repository = createDraftBatchRepository(fake.db);

    expect(await repository.periodTotals('user-1', NOW, NOW)).toEqual({
      income: 6_000_000,
      spent: 48_000,
    });
    expect(await repository.periodTotals('user-1', NOW, NOW)).toEqual({ income: 0, spent: 0 });
    expect(fake.queries[0]?.params).toContain(TRANSACTION_TYPE.income);
    expect(fake.queries[0]?.sql).toContain('filter (where "type" = $1)');
  });

  const TRANSACTION = {
    id: 'tx-1',
    userId: 'user-1',
    type: TRANSACTION_TYPE.expense,
    amount: 1,
    category: EXPENSE_CATEGORY.food,
    name: 'x',
    occurredAt: NOW,
    source: TRANSACTION_SOURCE.chat,
  };

  const commitInput = { userId: 'user-1', messageId: MESSAGE_ID, now: NOW };
  const plan = {
    payload: { draftStatus: DRAFT_STATUS.committed },
    transactions: [TRANSACTION],
    remainingPayload: { batchId: BATCH_ID },
  };
  const locked = [{ payload: message.payload }];

  test('locks the reply, plans from its payload, and saves everything together', async () => {
    const remaining = { ...row, kind: MESSAGE_KIND.remaining, sender: MESSAGE_SENDER.kira };
    const fake = createFakeDb(inOrder(locked, [row], [], [remaining]));
    const seen: unknown[] = [];

    const result = await createDraftBatchRepository(fake.db).commit(commitInput, async (payload) => {
      seen.push(payload);
      return plan;
    });

    expect(seen).toEqual([message.payload]);
    expect(result?.message).toEqual(message);
    expect(result?.remaining.kind).toBe(MESSAGE_KIND.remaining);
    expect(fake.queries.map((query) => query.sql.split(' ')[0])).toEqual([
      'select',
      'update',
      'insert',
      'insert',
    ]);
    expect(fake.queries[0]?.sql).toEndWith('for update');
    expect(fake.queries[1]?.sql).toContain(`"payload"->>$`);
  });

  test('saves nothing when the reply is gone, the plan declines, or it is no longer pending', async () => {
    const repository = (rows: Parameters<typeof inOrder>) =>
      createDraftBatchRepository(createFakeDb(inOrder(...rows)).db);

    expect(await repository([[]]).commit(commitInput, async () => plan)).toBeNull();
    expect(await repository([locked]).commit(commitInput, async () => null)).toBeNull();
    expect(await repository([locked, []]).commit(commitInput, async () => plan)).toBeNull();
  });

  test('fails loudly when the remaining message is not stored', async () => {
    const fake = createFakeDb(inOrder(locked, [row]));
    await expect(
      createDraftBatchRepository(fake.db).commit(commitInput, async () => plan),
    ).rejects.toThrow('The remaining message was not stored');
  });

  test('finds the reply of a batch, or null', async () => {
    const fake = createFakeDb(inOrder([row], []));
    const repository = createDraftBatchRepository(fake.db);

    expect(await repository.findBatch('user-1', BATCH_ID)).toEqual(message);
    expect(await repository.findBatch('user-1', BATCH_ID)).toBeNull();
    expect(fake.queries[0]?.params).toContain(BATCH_ID);
  });

  test('undoes a batch: restores the drafts, deletes its transactions and remaining message', async () => {
    const fake = createFakeDb(inOrder([row]));
    const input = { userId: 'user-1', messageId: MESSAGE_ID, batchId: BATCH_ID, payload: {} };
    const repository = createDraftBatchRepository(fake.db);

    expect(await repository.undo(input)).toEqual(message);
    expect(fake.queries.map((query) => query.sql.split(' ')[0])).toEqual([
      'update',
      'delete',
      'delete',
    ]);
    expect(await repository.undo(input)).toBeNull();
  });
});
