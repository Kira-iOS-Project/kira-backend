/**
 * PR-blocking: an edit of the drafts that lands while Simpan runs is never lost (review finding 4).
 * The real service and repository run over the fake Postgres; the edit lands after the service's
 * first read and before the saving transaction locks the reply.
 */

import { expect, test } from 'bun:test';
import { MESSAGE_KIND } from '../../../lib/constants/chat.ts';
import { createFakeDb, type FakeQuery, type FakeRow } from '../../../test/fake-postgres.ts';
import { createDraftBatchRepository } from '../draft-batch.repository.ts';
import { commitDrafts } from '../draft-batch.service.ts';
import { createDraftMock, createDraftsMessageMock, MESSAGE_ID, NOW } from './helpers.ts';

test('Simpan saves the drafts as they are when it locks the reply, not as first read', async () => {
  const before = createDraftsMessageMock();
  const edited = { ...before.payload, drafts: [createDraftMock({ amount: 50_000 })] };
  const stored = { payload: before.payload };
  const row = (payload: object) => ({
    ...before,
    payload,
    createdAt: before.createdAt.toISOString(),
  });
  const inserted: FakeQuery[] = [];

  const respond = (query: FakeQuery): FakeRow[] => {
    const { sql } = query;
    if (sql.includes('left join "chat_messages" "source"')) {
      const first = { ...row(stored.payload), sourceKind: MESSAGE_KIND.personText };
      stored.payload = edited;
      return [first];
    }
    if (sql.endsWith('for update')) return [{ payload: stored.payload }];
    if (sql.startsWith('update "chat_messages"')) return [row(stored.payload)];
    if (sql.startsWith('insert into "transactions"')) return (void inserted.push(query), []);
    if (sql.startsWith('insert into "chat_messages"')) {
      return [{ ...row({}), kind: MESSAGE_KIND.remaining }];
    }
    return [];
  };
  const repository = createDraftBatchRepository(createFakeDb(respond).db);

  await commitDrafts('user-1', MESSAGE_ID, { repository, now: () => NOW });

  expect(inserted).toHaveLength(1);
  expect(inserted[0]?.params).toContain(50_000);
  expect(inserted[0]?.params).not.toContain(25_000);
});
