import { describe, expect, test } from 'bun:test';
import { MESSAGE_KIND } from '../../../lib/constants/chat.ts';
import {
  EXPENSE_CATEGORY,
  INCOME_CATEGORY,
  TRANSACTION_SOURCE,
  TRANSACTION_TYPE,
} from '../../../lib/constants/money.ts';
import type { NewTransaction, TransactionPatch } from '../transaction.repository.ts';
import {
  createManual,
  deleteTransaction,
  getTransaction,
  updateTransaction,
} from '../transaction.service.ts';
import {
  CLIENT_ID,
  createManualMessageMock,
  createTransactionRepositoryMock,
  createTransactionRowMock,
  NOW,
  SOURCE_ID,
  TX_ID,
} from './helpers.ts';

const body = {
  clientId: CLIENT_ID,
  type: TRANSACTION_TYPE.expense,
  amount: 18_000,
  category: EXPENSE_CATEGORY.transport,
  name: 'Grab ke Kantor',
  occurredAt: '2026-10-16T12:41:00+07:00',
};
const saved = { transaction: createTransactionRowMock(), message: createManualMessageMock() };

describe('createManual', () => {
  test('saves the entry with its chat note', async () => {
    const created: NewTransaction[] = [];
    const repository = createTransactionRepositoryMock({
      createManual: async (input) => {
        created.push(input.transaction);
        expect(input.message).toEqual({ transactionIds: [TX_ID], itemCount: 1 });
        return saved;
      },
    });

    const result = await createManual('user-1', body, {
      repository,
      now: () => NOW,
      newId: () => TX_ID,
    });

    expect(created[0]).toMatchObject({
      id: TX_ID,
      source: TRANSACTION_SOURCE.manual,
      note: null,
      occurredAt: NOW,
    });
    expect(result.transaction.occurredAt).toBe(NOW.toISOString());
    expect(result.message.kind).toBe(MESSAGE_KIND.manualSaved);
  });

  test('answers a retry with the first save, also after losing a race', async () => {
    let lookups = 0;
    const nothing = { transaction: null, message: null };
    const racing = createTransactionRepositoryMock({
      findManualByClientId: async () => (lookups++ === 0 ? nothing : saved),
    });
    const replay = createTransactionRepositoryMock({ findManualByClientId: async () => saved });

    expect(
      (await createManual('user-1', { ...body, note: 'pagi' }, { repository: racing })).transaction
        .id,
    ).toBe(TX_ID);
    expect((await createManual('user-1', body, { repository: replay })).message.kind).toBe(
      MESSAGE_KIND.manualSaved,
    );
    await expect(
      createManual('user-1', body, { repository: createTransactionRepositoryMock() }),
    ).rejects.toThrow('The manual entry was neither saved nor found');
  });

  test('answers 404, never a second save, when a retried entry was deleted', async () => {
    let created = 0;
    const repository = createTransactionRepositoryMock({
      findManualByClientId: async () => ({ transaction: null, message: saved.message }),
      createManual: async () => {
        created += 1;
        return saved;
      },
    });

    await expect(createManual('user-1', body, { repository })).rejects.toMatchObject({
      statusCode: 404,
      code: 'TRANSACTION_NOT_FOUND',
    });
    expect(created).toBe(0);
  });
});

describe('getTransaction', () => {
  const detail = {
    ...createTransactionRowMock(),
    spanStart: 0,
    spanEnd: 4,
    sourceBody: 'grab 18rb',
    sourceCreatedAt: NOW,
  };

  test('answers the detail with the quoted source message', async () => {
    const repository = createTransactionRepositoryMock({
      findDetail: async () => ({ ...detail, sourceMessageId: SOURCE_ID }),
    });

    expect((await getTransaction('user-1', TX_ID, { repository })).sourceMessage).toEqual({
      id: SOURCE_ID,
      body: 'grab 18rb',
      createdAt: NOW.toISOString(),
      spanStart: 0,
      spanEnd: 4,
    });
  });

  test('has no source for a manual entry, and answers 404 for an unknown id', async () => {
    const repository = createTransactionRepositoryMock({ findDetail: async () => detail });
    expect((await getTransaction('user-1', TX_ID, { repository })).sourceMessage).toBeNull();
    await expect(getTransaction('user-1', TX_ID)).rejects.toMatchObject({
      statusCode: 404,
      code: 'TRANSACTION_NOT_FOUND',
    });
  });
});

describe('updateTransaction', () => {
  test('patches only the given fields and follows the category’s direction', async () => {
    const patches: TransactionPatch[] = [];
    const repository = createTransactionRepositoryMock({
      update: async (_userId, _id, patch) => {
        patches.push(patch);
        return createTransactionRowMock(patch);
      },
    });

    await updateTransaction(
      'user-1',
      TX_ID,
      { category: INCOME_CATEGORY.bonus, note: null },
      { repository },
    );
    await updateTransaction(
      'user-1',
      TX_ID,
      { name: 'Ojek', amount: 20_000, occurredAt: '2026-10-16T12:41:00+07:00', note: 'hujan' },
      { repository },
    );

    expect(patches).toEqual([
      { category: INCOME_CATEGORY.bonus, type: TRANSACTION_TYPE.income, note: null },
      { name: 'Ojek', amount: 20_000, occurredAt: NOW, note: 'hujan' },
    ]);
  });

  test('answers the transaction unchanged for an empty patch, and 404 when it is missing', async () => {
    const detail = {
      ...createTransactionRowMock(),
      spanStart: null,
      spanEnd: null,
      sourceBody: null,
      sourceCreatedAt: null,
    };
    const repository = createTransactionRepositoryMock({ findDetail: async () => detail });

    expect(await updateTransaction('user-1', TX_ID, {}, { repository })).not.toHaveProperty(
      'spanStart',
    );
    await expect(updateTransaction('user-1', TX_ID, { name: 'x' })).rejects.toMatchObject({
      statusCode: 404,
    });
  });
});

describe('deleteTransaction', () => {
  test('deletes, or answers 404', async () => {
    const repository = createTransactionRepositoryMock({ remove: async () => true });
    expect(await deleteTransaction('user-1', TX_ID, { repository })).toBeUndefined();
    await expect(deleteTransaction('user-1', TX_ID)).rejects.toMatchObject({
      code: 'TRANSACTION_NOT_FOUND',
    });
  });
});
