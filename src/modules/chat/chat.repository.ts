/**
 * The chat module's data access (AGENTS.md Rules 4 and 10): the message history, the AI consent,
 * and storing a person's message with its quota and Kira's reply in one transaction.
 */

import { and, asc, desc, eq, gt, lt, lte, or, sql } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { db } from '../../db/client/index.ts';
import {
  chatMessages,
  consents,
  type MessagePayload,
  usageCounters,
} from '../../db/schema/schema.ts';
import type { MessageRow } from '../../lib/chat/chat-message.ts';
import { DRAFT_STATUS, MESSAGE_SENDER } from '../../lib/constants/chat.ts';
import { CONSENT_PURPOSE } from '../../lib/constants/consents.ts';
import type { Cursor } from '../../lib/pagination/cursor.ts';
import type { UsageCounters } from '../../lib/usage/plan-usage.ts';

export type NewMessage = {
  kind: MessageRow['kind'];
  body: string | null;
  payload: MessagePayload;
  createdAt: Date;
};

export type IncomingInput = {
  userId: string;
  clientId: string;
  person: NewMessage;
  reply: Omit<NewMessage, 'body'>;
  /** What this message spends, and the plan's ceilings it may not pass. */
  quota: { periodStart: string; use: UsageCounters; limits: UsageCounters };
};

/** A person's message and Kira's reply; no reply when the quota ran out. */
export type Exchange = { person: MessageRow; reply: MessageRow | null };

export type ChatRepository = {
  /** Newest first, strictly older than the cursor. */
  listBefore(userId: string, cursor: Cursor | null, limit: number): Promise<MessageRow[]>;
  /** `older` newest first and holding the anchor; `newer` oldest first. */
  listAround(
    userId: string,
    anchor: Cursor,
    limit: number,
  ): Promise<{ older: MessageRow[]; newer: MessageRow[] }>;
  findMessage(userId: string, id: string): Promise<MessageRow | null>;
  findByClientId(userId: string, clientId: string): Promise<Exchange | null>;
  aiConsentGranted(userId: string): Promise<boolean>;
  /** Null when a message with the same client id was stored first. */
  storeIncoming(input: IncomingInput): Promise<Exchange | null>;
  /** Null when the drafts are no longer pending. */
  replaceDrafts(userId: string, id: string, payload: MessagePayload): Promise<MessageRow | null>;
};

const messageColumns = {
  id: chatMessages.id,
  sender: chatMessages.sender,
  kind: chatMessages.kind,
  body: chatMessages.body,
  payload: chatMessages.payload,
  replyToId: chatMessages.replyToId,
  createdAt: chatMessages.createdAt,
};

const mine = (userId: string) => eq(chatMessages.userId, userId);

const NEWEST_FIRST = [desc(chatMessages.createdAt), desc(chatMessages.id)];

function olderThan(cursor: Cursor, inclusive: boolean) {
  const sameInstant = inclusive ? lte(chatMessages.id, cursor.id) : lt(chatMessages.id, cursor.id);
  return or(
    lt(chatMessages.createdAt, cursor.at),
    and(eq(chatMessages.createdAt, cursor.at), sameInstant),
  );
}

function newerThan(cursor: Cursor) {
  return or(
    gt(chatMessages.createdAt, cursor.at),
    and(eq(chatMessages.createdAt, cursor.at), gt(chatMessages.id, cursor.id)),
  );
}

export function createChatRepository(client: PostgresJsDatabase = db): ChatRepository {
  const select = () => client.select(messageColumns).from(chatMessages);

  async function replyTo(personId: string, userId: string): Promise<MessageRow | null> {
    const [reply] = await select()
      .where(and(mine(userId), eq(chatMessages.replyToId, personId)))
      .orderBy(asc(chatMessages.createdAt))
      .limit(1);
    return reply ?? null;
  }

  return {
    listBefore: (userId, cursor, limit) =>
      select()
        .where(and(mine(userId), cursor ? olderThan(cursor, false) : undefined))
        .orderBy(...NEWEST_FIRST)
        .limit(limit),

    async listAround(userId, anchor, limit) {
      const [older, newer] = await Promise.all([
        select()
          .where(and(mine(userId), olderThan(anchor, true)))
          .orderBy(...NEWEST_FIRST)
          .limit(limit),
        select()
          .where(and(mine(userId), newerThan(anchor)))
          .orderBy(asc(chatMessages.createdAt), asc(chatMessages.id))
          .limit(limit),
      ]);
      return { older, newer };
    },

    async findMessage(userId, id) {
      const [row] = await select()
        .where(and(mine(userId), eq(chatMessages.id, id)))
        .limit(1);
      return row ?? null;
    },

    async findByClientId(userId, clientId) {
      const [person] = await select()
        .where(and(mine(userId), eq(chatMessages.clientId, clientId)))
        .limit(1);
      return person ? { person, reply: await replyTo(person.id, userId) } : null;
    },

    async aiConsentGranted(userId) {
      const [row] = await client
        .select({ granted: consents.granted })
        .from(consents)
        .where(and(eq(consents.userId, userId), eq(consents.purpose, CONSENT_PURPOSE.aiProcessing)))
        .orderBy(desc(consents.decidedAt))
        .limit(1);
      return row?.granted ?? false;
    },

    storeIncoming({ userId, clientId, person, reply, quota }) {
      return client.transaction(async (tx) => {
        const [stored] = await tx
          .insert(chatMessages)
          .values({ userId, clientId, sender: MESSAGE_SENDER.person, ...person })
          .onConflictDoNothing({ target: [chatMessages.userId, chatMessages.clientId] })
          .returning(messageColumns);
        if (!stored) return null;
        const { use, limits } = quota;
        const [counted] = await tx
          .insert(usageCounters)
          .values({ userId, periodStart: quota.periodStart, ...use })
          .onConflictDoUpdate({
            target: [usageCounters.userId, usageCounters.periodStart],
            set: {
              aiMessages: sql`${usageCounters.aiMessages} + ${use.aiMessages}`,
              receipts: sql`${usageCounters.receipts} + ${use.receipts}`,
              voiceSeconds: sql`${usageCounters.voiceSeconds} + ${use.voiceSeconds}`,
              updatedAt: sql`now()`,
            },
            setWhere: sql`${usageCounters.aiMessages} + ${use.aiMessages} <= ${limits.aiMessages}
              and ${usageCounters.receipts} + ${use.receipts} <= ${limits.receipts}
              and ${usageCounters.voiceSeconds} + ${use.voiceSeconds} <= ${limits.voiceSeconds}`,
          })
          .returning({ userId: usageCounters.userId });
        if (!counted) return { person: stored, reply: null };
        const [answer] = await tx
          .insert(chatMessages)
          .values({
            userId,
            sender: MESSAGE_SENDER.kira,
            body: null,
            replyToId: stored.id,
            ...reply,
          })
          .returning(messageColumns);
        return { person: stored, reply: answer ?? null };
      });
    },

    async replaceDrafts(userId, id, payload) {
      const [row] = await client
        .update(chatMessages)
        .set({ payload })
        .where(
          and(
            mine(userId),
            eq(chatMessages.id, id),
            sql`${chatMessages.payload}->>'draftStatus' = ${DRAFT_STATUS.pending}`,
          ),
        )
        .returning(messageColumns);
      return row ?? null;
    },
  };
}

export const chatRepository = createChatRepository();
