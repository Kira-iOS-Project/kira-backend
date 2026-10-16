import { describe, expect, test } from 'bun:test';
import { DRAFT_STATUS, MESSAGE_KIND, MESSAGE_SENDER } from '../../../lib/constants/chat.ts';
import type { MessagePayload } from '../../../db/schema/schema.ts';
import { decodeCursor, encodeCursor } from '../../../lib/pagination/cursor.ts';
import { listMessages, updateDrafts } from '../chat.history.service.ts';
import {
  createChatRepositoryMock,
  createMessageMock,
  DRAFT_INPUT,
  NOW,
  PERSON_ID,
  REPLY_ID,
} from './helpers.ts';

const at = (seconds: number) => new Date(NOW.getTime() + seconds * 1000);
const id = (n: number) => `5e0c1d2a-0000-4000-8000-${String(n).padStart(12, '0')}`;
const message = (n: number) => createMessageMock({ id: id(n), createdAt: at(n) });

describe('listMessages', () => {
  test('returns a page oldest first with a cursor to the older ones', async () => {
    const cursors: unknown[] = [];
    const repository = createChatRepositoryMock({
      listBefore: async (_userId, cursor, limit) => {
        cursors.push({ cursor, limit });
        return [message(3), message(2), message(1)];
      },
    });
    const before = encodeCursor({ at: at(4), id: id(4) });

    const page = await listMessages('user-1', { before, limit: 2 }, { repository });

    expect(cursors).toEqual([{ cursor: { at: at(4), id: id(4) }, limit: 3 }]);
    expect(page.items.map((item) => item.id)).toEqual([id(2), id(3)]);
    expect(decodeCursor(page.nextCursor ?? '')).toEqual({ at: at(2), id: id(2) });
  });

  test('has no cursor on the last page', async () => {
    const repository = createChatRepositoryMock({ listBefore: async () => [message(1)] });
    expect(await listMessages('user-1', { limit: 30 }, { repository })).toMatchObject({
      nextCursor: null,
    });
    expect(await listMessages('user-1', { limit: 30 })).toEqual({ items: [], nextCursor: null });
  });

  test('centres a window on a message', async () => {
    const repository = createChatRepositoryMock({
      findMessage: async () => message(5),
      listAround: async (_userId, anchor, limit) => {
        expect(anchor).toEqual({ at: at(5), id: id(5) });
        expect(limit).toBe(3);
        return {
          older: [message(5), message(4), message(3)],
          newer: [message(6), message(7), message(8)],
        };
      },
    });

    const page = await listMessages('user-1', { around: id(5), limit: 4 }, { repository });

    expect(page.items.map((item) => item.id)).toEqual([id(4), id(5), id(6), id(7)]);
    expect(decodeCursor(page.nextCursor ?? '')?.id).toBe(id(4));
  });

  test('answers 404 around a message that is not there', async () => {
    await expect(
      listMessages(
        'user-1',
        { around: PERSON_ID, limit: 30 },
        { repository: createChatRepositoryMock() },
      ),
    ).rejects.toMatchObject({ statusCode: 404, code: 'CHAT_MESSAGE_NOT_FOUND' });
  });
});

describe('updateDrafts', () => {
  const pending = (
    payload: MessagePayload = { draftStatus: DRAFT_STATUS.pending },
    kind = MESSAGE_KIND.drafts,
  ) => createMessageMock({ id: REPLY_ID, sender: MESSAGE_SENDER.kira, kind, payload });
  const edit = { ...DRAFT_INPUT, id: id(9) };

  test('replaces the drafts, and discards them when the list is empty', async () => {
    const payloads: MessagePayload[] = [];
    const repository = createChatRepositoryMock({
      findMessage: async () => pending(),
      replaceDrafts: async (_userId, _id, payload) => {
        payloads.push(payload);
        return pending(payload);
      },
    });

    const updated = await updateDrafts('user-1', REPLY_ID, [edit], { repository });
    const discarded = await updateDrafts('user-1', REPLY_ID, [], { repository });

    expect(updated.drafts?.[0]).toMatchObject({
      id: id(9),
      occurredAt: '2026-10-16T05:41:00.000Z',
    });
    expect(updated.draftStatus).toBe(DRAFT_STATUS.pending);
    expect(discarded.draftStatus).toBe(DRAFT_STATUS.discarded);
  });

  test('refuses an unknown message, settled drafts and a lost race', async () => {
    const run = (repository = createChatRepositoryMock()) =>
      updateDrafts('user-1', REPLY_ID, [edit], { repository });

    await expect(run()).rejects.toMatchObject({ statusCode: 404 });
    await expect(
      run(createChatRepositoryMock({ findMessage: async () => createMessageMock() })),
    ).rejects.toMatchObject({
      statusCode: 409,
      code: 'CHAT_DRAFTS_NOT_PENDING',
    });
    await expect(
      run(
        createChatRepositoryMock({
          findMessage: async () => pending({ draftStatus: DRAFT_STATUS.committed }),
        }),
      ),
    ).rejects.toMatchObject({ statusCode: 409 });
    await expect(
      run(createChatRepositoryMock({ findMessage: async () => pending() })),
    ).rejects.toMatchObject({
      code: 'CHAT_DRAFTS_NOT_PENDING',
    });
  });
});
