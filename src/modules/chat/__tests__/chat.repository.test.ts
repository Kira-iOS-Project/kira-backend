import { describe, expect, test } from 'bun:test';
import { MESSAGE_KIND } from '../../../lib/constants/chat.ts';
import { CONSENT_PURPOSE } from '../../../lib/constants/consents.ts';
import { createFakeDb, inOrder } from '../../../test/fake-postgres.ts';
import { createChatRepository, type IncomingInput } from '../chat.repository.ts';
import { CLIENT_ID, createMessageMock, NOW, PERSON_ID, REPLY_ID } from './helpers.ts';

const person = createMessageMock();
const reply = createMessageMock({ id: REPLY_ID, kind: MESSAGE_KIND.drafts, replyToId: PERSON_ID });
const rowOf = (message: typeof person) => ({
  ...message,
  createdAt: message.createdAt.toISOString(),
});

describe('createChatRepository', () => {
  test('lists a page newest first, after a cursor when given', async () => {
    const fake = createFakeDb(inOrder([rowOf(person)], []));
    const repository = createChatRepository(fake.db);

    expect(await repository.listBefore('user-1', null, 31)).toEqual([person]);
    expect(await repository.listBefore('user-1', { at: NOW, id: PERSON_ID }, 31)).toEqual([]);
    expect(fake.queries[0]?.sql).toContain(
      'order by "chat_messages"."created_at" desc, "chat_messages"."id" desc',
    );
    expect(fake.queries[1]?.sql).toContain('"chat_messages"."id" < $');
  });

  test('lists the window around a message', async () => {
    const fake = createFakeDb(inOrder([rowOf(person)], [rowOf(reply)]));

    const window = await createChatRepository(fake.db).listAround(
      'user-1',
      { at: NOW, id: PERSON_ID },
      16,
    );

    expect(window).toEqual({ older: [person], newer: [reply] });
    expect(fake.queries[0]?.sql).toContain('"chat_messages"."id" <= $');
    expect(fake.queries[1]?.sql).toContain('"chat_messages"."id" > $');
  });

  test('finds a message, or null', async () => {
    const fake = createFakeDb(inOrder([rowOf(person)], []));
    const repository = createChatRepository(fake.db);

    expect(await repository.findMessage('user-1', PERSON_ID)).toEqual(person);
    expect(await repository.findMessage('user-1', PERSON_ID)).toBeNull();
  });

  test('finds a stored exchange by its client id', async () => {
    const fake = createFakeDb(inOrder([rowOf(person)], [rowOf(reply)], [rowOf(person)], [], []));
    const repository = createChatRepository(fake.db);

    expect(await repository.findByClientId('user-1', CLIENT_ID)).toEqual({ person, reply });
    expect(await repository.findByClientId('user-1', CLIENT_ID)).toEqual({ person, reply: null });
    expect(await repository.findByClientId('user-1', CLIENT_ID)).toBeNull();
    expect(fake.queries[1]?.sql).toContain('"chat_messages"."reply_to_id" = $');
  });

  test('reads the latest AI consent decision, off when there is none', async () => {
    const fake = createFakeDb(inOrder([{ granted: true }], []));
    const repository = createChatRepository(fake.db);

    expect(await repository.aiConsentGranted('user-1')).toBe(true);
    expect(await repository.aiConsentGranted('user-1')).toBe(false);
    expect(fake.queries[0]?.params).toContain(CONSENT_PURPOSE.aiProcessing);
    expect(fake.queries[0]?.sql).toContain('order by "consents"."decided_at" desc');
  });

  const input: IncomingInput = {
    userId: 'user-1',
    clientId: CLIENT_ID,
    person: { kind: MESSAGE_KIND.personText, body: 'kopi', payload: {}, createdAt: NOW },
    reply: { kind: MESSAGE_KIND.noDrafts, payload: {}, createdAt: NOW },
    quota: {
      periodStart: '2026-10-01',
      use: { aiMessages: 1, receipts: 0, voiceSeconds: 0 },
      limits: { aiMessages: 30, receipts: 10, voiceSeconds: 0 },
    },
  };

  test('stores the message, spends the quota and stores the reply together', async () => {
    const fake = createFakeDb(inOrder([rowOf(person)], [{ userId: 'user-1' }], [rowOf(reply)]));

    expect(await createChatRepository(fake.db).storeIncoming(input)).toEqual({ person, reply });
    expect(fake.queries[0]?.sql).toContain('on conflict ("user_id","client_id") do nothing');
    expect(fake.queries[1]?.sql).toContain('on conflict ("user_id","period_start") do update');
    expect(fake.queries[1]?.sql).toContain('where "usage_counters"."ai_messages" + $');
  });

  test('keeps the message without a reply when the quota is spent', async () => {
    const fake = createFakeDb(inOrder([rowOf(person)], []));

    expect(await createChatRepository(fake.db).storeIncoming(input)).toEqual({
      person,
      reply: null,
    });
    expect(fake.queries).toHaveLength(2);
  });

  test('stores nothing for a client id already used, and tolerates a missing reply row', async () => {
    const fake = createFakeDb(inOrder([], [rowOf(person)], [{ userId: 'user-1' }], []));
    const repository = createChatRepository(fake.db);

    expect(await repository.storeIncoming(input)).toBeNull();
    expect(await repository.storeIncoming(input)).toEqual({ person, reply: null });
  });

  test('replaces drafts only while they are pending', async () => {
    const fake = createFakeDb(inOrder([rowOf(reply)], []));
    const repository = createChatRepository(fake.db);

    expect(await repository.replaceDrafts('user-1', REPLY_ID, {})).toEqual(reply);
    expect(await repository.replaceDrafts('user-1', REPLY_ID, {})).toBeNull();
    expect(fake.queries[0]?.sql).toContain(`"chat_messages"."payload"->>'draftStatus' = $`);
  });
});
