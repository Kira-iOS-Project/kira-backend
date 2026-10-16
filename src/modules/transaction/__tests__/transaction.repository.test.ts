import { describe, expect, test } from 'bun:test';
import {
  EXPENSE_CATEGORY,
  TRANSACTION_SOURCE,
  TRANSACTION_TYPE,
} from '../../../lib/constants/money.ts';
import { createFakeDb, inOrder } from '../../../test/fake-postgres.ts';
import { createTransactionRepository } from '../transaction.repository.ts';
import {
  CLIENT_ID,
  createManualMessageMock,
  createTransactionRowMock,
  NOW,
  SOURCE_ID,
  TX_ID,
} from './helpers.ts';

const transaction = createTransactionRowMock();
const message = createManualMessageMock();
const iso = <T extends { occurredAt?: Date; createdAt?: Date }>(row: T) => ({
  ...row,
  ...(row.occurredAt ? { occurredAt: row.occurredAt.toISOString() } : {}),
  ...(row.createdAt ? { createdAt: row.createdAt.toISOString() } : {}),
});

const NEW = {
  id: TX_ID,
  userId: 'user-1',
  clientId: CLIENT_ID,
  type: TRANSACTION_TYPE.expense,
  amount: 18_000,
  category: EXPENSE_CATEGORY.transport,
  name: 'Grab',
  occurredAt: NOW,
  source: TRANSACTION_SOURCE.manual,
};

describe('createTransactionRepository', () => {
  test('finds a manual entry and its note by client id, only when both exist', async () => {
    const fake = createFakeDb(inOrder([iso(transaction)], [iso(message)], [iso(transaction)], []));
    const repository = createTransactionRepository(fake.db);

    expect(await repository.findManualByClientId('user-1', CLIENT_ID)).toEqual({
      transaction,
      message,
    });
    expect(await repository.findManualByClientId('user-1', CLIENT_ID)).toBeNull();
  });

  test('saves a manual entry with its chat note, or nothing on a client id conflict', async () => {
    const fake = createFakeDb(inOrder([iso(transaction)], [iso(message)], []));
    const repository = createTransactionRepository(fake.db);
    const input = { transaction: NEW, message: { itemCount: 1 }, now: NOW };

    expect(await repository.createManual(input)).toEqual({ transaction, message });
    expect(fake.queries[0]?.sql).toContain('on conflict ("user_id","client_id") do nothing');
    expect(await repository.createManual(input)).toBeNull();
  });

  test('fails loudly when the note is not stored', async () => {
    const fake = createFakeDb(inOrder([iso(transaction)]));
    await expect(
      createTransactionRepository(fake.db).createManual({
        transaction: NEW,
        message: {},
        now: NOW,
      }),
    ).rejects.toThrow('The manual entry message was not stored');
  });

  test('lists with every filter, escaping the search pattern', async () => {
    const fake = createFakeDb(inOrder([iso(transaction)], []));
    const repository = createTransactionRepository(fake.db);

    const rows = await repository.list(
      'user-1',
      {
        from: NOW,
        to: NOW,
        type: TRANSACTION_TYPE.expense,
        category: EXPENSE_CATEGORY.transport,
        q: '50%_off\\',
      },
      { at: NOW, id: TX_ID },
      31,
    );
    await repository.list('user-1', {}, null, 31);

    expect(rows).toEqual([transaction]);
    expect(fake.queries[0]?.params).toContain('%50\\%\\_off\\\\%');
    expect(fake.queries[0]?.sql).toContain('ilike');
    expect(fake.queries[1]?.sql).not.toContain('ilike');
    expect(fake.queries[1]?.sql).toContain('order by "transactions"."occurred_at" desc');
  });

  test('totals each WIB day', async () => {
    const fake = createFakeDb(inOrder([{ date: '2026-10-16', expense: '18000', income: '0' }]));

    const days = await createTransactionRepository(fake.db).dailyTotals('user-1', NOW, NOW);

    expect(days).toEqual([{ date: '2026-10-16', expense: 18_000, income: 0 }]);
    expect(fake.queries[0]?.sql).toContain(`at time zone 'Asia/Jakarta'`);
    expect(fake.queries[0]?.sql).toContain('group by');
  });

  test('finds the detail with its source message, or null', async () => {
    const row = {
      ...iso(transaction),
      spanStart: 0,
      spanEnd: 4,
      sourceBody: 'grab 18rb',
      sourceCreatedAt: NOW.toISOString(),
    };
    const fake = createFakeDb(inOrder([row], []));
    const repository = createTransactionRepository(fake.db);

    expect(await repository.findDetail('user-1', TX_ID)).toEqual({
      ...transaction,
      spanStart: 0,
      spanEnd: 4,
      sourceBody: 'grab 18rb',
      sourceCreatedAt: NOW,
    });
    expect(await repository.findDetail('user-1', SOURCE_ID)).toBeNull();
    expect(fake.queries[0]?.sql).toContain('left join "chat_messages"');
  });

  test('updates and deletes, reporting a missing row', async () => {
    const fake = createFakeDb(inOrder([iso(transaction)], [], [{ id: TX_ID }], []));
    const repository = createTransactionRepository(fake.db);

    expect(await repository.update('user-1', TX_ID, { name: 'Grab' })).toEqual(transaction);
    expect(await repository.update('user-1', TX_ID, { name: 'Grab' })).toBeNull();
    expect(await repository.remove('user-1', TX_ID)).toBe(true);
    expect(await repository.remove('user-1', TX_ID)).toBe(false);
  });
});
