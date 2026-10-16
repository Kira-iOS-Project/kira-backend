/**
 * Reading the Catat chat (CAT-01, CAT-08f) and editing a reply's drafts before they are saved
 * (CAT-02). Pages run newest to oldest by cursor and are returned oldest first, as the chat draws.
 */

import { type ChatMessage, type MessageRow, toChatMessage } from '../../lib/chat/chat-message.ts';
import { DRAFT_STATUS, MESSAGE_KIND } from '../../lib/constants/chat.ts';
import { decodeCursor, encodeCursor } from '../../lib/pagination/cursor.ts';
import { DraftsNotPendingError, MessageNotFoundError } from '../draft-batch/index.ts';
import { type ChatRepository, chatRepository } from './chat.repository.ts';
import type { DraftEdit, ListMessagesQuery, MessagePage } from './chat.schema.ts';

type HistoryDeps = { repository?: ChatRepository };

/** `rows` newest first, one more than `limit` when older ones remain. */
function pageOf(rows: MessageRow[], limit: number) {
  const kept = rows.slice(0, limit);
  const oldest = kept.at(-1);
  return {
    items: kept.toReversed().map(toChatMessage),
    nextCursor:
      rows.length > limit && oldest ? encodeCursor({ at: oldest.createdAt, id: oldest.id }) : null,
  };
}

export async function listMessages(
  userId: string,
  query: ListMessagesQuery,
  deps: HistoryDeps = {},
): Promise<MessagePage> {
  const repository = deps.repository ?? chatRepository;
  if (!query.around) {
    const cursor = query.before ? decodeCursor(query.before) : null;
    return pageOf(await repository.listBefore(userId, cursor, query.limit + 1), query.limit);
  }
  const anchor = await repository.findMessage(userId, query.around);
  if (!anchor) throw new MessageNotFoundError();
  const half = Math.ceil(query.limit / 2);
  const { older, newer } = await repository.listAround(
    userId,
    { at: anchor.createdAt, id: anchor.id },
    half + 1,
  );
  const page = pageOf(older, half);
  return {
    items: [...page.items, ...newer.slice(0, half).map(toChatMessage)],
    nextCursor: page.nextCursor,
  };
}

/** Replaces a pending reply's drafts; an empty list discards them. */
export async function updateDrafts(
  userId: string,
  messageId: string,
  drafts: DraftEdit[],
  deps: HistoryDeps = {},
): Promise<ChatMessage> {
  const repository = deps.repository ?? chatRepository;
  const message = await repository.findMessage(userId, messageId);
  if (!message) throw new MessageNotFoundError();
  if (
    message.kind !== MESSAGE_KIND.drafts ||
    message.payload.draftStatus !== DRAFT_STATUS.pending
  ) {
    throw new DraftsNotPendingError('not pending');
  }
  const updated = await repository.replaceDrafts(userId, messageId, {
    ...message.payload,
    drafts: drafts.map((draft) => ({
      ...draft,
      occurredAt: new Date(draft.occurredAt).toISOString(),
    })),
    draftStatus: drafts.length > 0 ? DRAFT_STATUS.pending : DRAFT_STATUS.discarded,
  });
  if (!updated) throw new DraftsNotPendingError('settled during the edit');
  return toChatMessage(updated);
}
