/**
 * The draft-batch module's data access (AGENTS.md Rules 4 and 10): saving a reply's drafts as one
 * batch of transactions with the engine's remaining-money message, and taking the batch back.
 */

import { and, eq, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { db } from '../../db/client/index.ts';
import {
  chatMessages,
  financialProfiles,
  type MessagePayload,
  transactions,
  users,
} from '../../db/schema/schema.ts';
import { DRAFT_STATUS, MESSAGE_KIND, MESSAGE_SENDER } from '../../lib/constants/chat.ts';
import { TRANSACTION_TYPE } from '../../lib/constants/money.ts';
import type { MessageRow } from '../../lib/chat/chat-message.ts';
import type { Payday } from '../../lib/time/wib.ts';

type MessageKind = MessageRow['kind'];

type BudgetProfile = { payday: Payday; netMonthlyIncome: number | null };

export type NewTransaction = typeof transactions.$inferInsert & { id: string };

export type CommitInput = {
  userId: string;
  messageId: string;
  payload: MessagePayload;
  transactions: NewTransaction[];
  remainingPayload: MessagePayload;
  now: Date;
};

export type DraftBatchRepository = {
  findDraftsMessage(
    userId: string,
    id: string,
  ): Promise<{ message: MessageRow; sourceKind: MessageKind | null } | null>;
  findBudgetProfile(userId: string): Promise<BudgetProfile>;
  /** Income and spending recorded in [from, to). */
  periodTotals(userId: string, from: Date, to: Date): Promise<{ income: number; spent: number }>;
  /** Null when the drafts stopped being pending before the save landed. */
  commit(input: CommitInput): Promise<{ message: MessageRow; remaining: MessageRow } | null>;
  findBatch(userId: string, batchId: string): Promise<MessageRow | null>;
  /** Puts the drafts back, deleting the batch's transactions and its remaining message. */
  undo(input: {
    userId: string;
    messageId: string;
    batchId: string;
    payload: MessagePayload;
  }): Promise<MessageRow | null>;
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

const payloadField = (field: keyof MessagePayload) => sql`${chatMessages.payload}->>${field}`;

function totalOf(type: (typeof TRANSACTION_TYPE)[keyof typeof TRANSACTION_TYPE]) {
  return sql<number>`coalesce(sum(${transactions.amount}) filter (where ${transactions.type} = ${type}), 0)`.mapWith(
    Number,
  );
}

export function createDraftBatchRepository(client: PostgresJsDatabase = db): DraftBatchRepository {
  return {
    async findDraftsMessage(userId, id) {
      const source = alias(chatMessages, 'source');
      const [row] = await client
        .select({ ...messageColumns, sourceKind: source.kind })
        .from(chatMessages)
        .leftJoin(source, eq(source.id, chatMessages.replyToId))
        .where(and(eq(chatMessages.userId, userId), eq(chatMessages.id, id)))
        .limit(1);
      if (!row) return null;
      const { sourceKind, ...message } = row;
      return { message, sourceKind };
    },

    async findBudgetProfile(userId) {
      const [row] = await client
        .select({
          day: users.paydayDay,
          endOfMonth: users.paydayEndOfMonth,
          netMonthlyIncome: financialProfiles.netMonthlyIncome,
        })
        .from(users)
        .leftJoin(financialProfiles, eq(financialProfiles.userId, users.id))
        .where(eq(users.id, userId))
        .limit(1);
      return {
        payday: { day: row?.day ?? null, endOfMonth: row?.endOfMonth ?? false },
        netMonthlyIncome: row?.netMonthlyIncome ?? null,
      };
    },

    async periodTotals(userId, from, to) {
      const [row] = await client
        .select({
          income: totalOf(TRANSACTION_TYPE.income),
          spent: totalOf(TRANSACTION_TYPE.expense),
        })
        .from(transactions)
        .where(
          and(
            eq(transactions.userId, userId),
            sql`${transactions.occurredAt} >= ${from.toISOString()}`,
            sql`${transactions.occurredAt} < ${to.toISOString()}`,
          ),
        );
      return { income: row?.income ?? 0, spent: row?.spent ?? 0 };
    },

    commit(input) {
      return client.transaction(async (tx) => {
        const [message] = await tx
          .update(chatMessages)
          .set({ payload: input.payload })
          .where(
            and(
              eq(chatMessages.id, input.messageId),
              eq(chatMessages.userId, input.userId),
              sql`${payloadField('draftStatus')} = ${DRAFT_STATUS.pending}`,
            ),
          )
          .returning(messageColumns);
        if (!message) return null;
        await tx.insert(transactions).values(input.transactions);
        const [remaining] = await tx
          .insert(chatMessages)
          .values({
            userId: input.userId,
            sender: MESSAGE_SENDER.kira,
            kind: MESSAGE_KIND.remaining,
            payload: input.remainingPayload,
            replyToId: input.messageId,
            createdAt: input.now,
          })
          .returning(messageColumns);
        if (!remaining) throw new Error('The remaining message was not stored');
        return { message, remaining };
      });
    },

    async findBatch(userId, batchId) {
      const [row] = await client
        .select(messageColumns)
        .from(chatMessages)
        .where(
          and(
            eq(chatMessages.userId, userId),
            eq(chatMessages.kind, MESSAGE_KIND.drafts),
            sql`${payloadField('batchId')} = ${batchId}`,
          ),
        )
        .limit(1);
      return row ?? null;
    },

    undo({ userId, messageId, batchId, payload }) {
      return client.transaction(async (tx) => {
        const [message] = await tx
          .update(chatMessages)
          .set({ payload })
          .where(
            and(
              eq(chatMessages.id, messageId),
              eq(chatMessages.userId, userId),
              sql`${payloadField('batchId')} = ${batchId}`,
            ),
          )
          .returning(messageColumns);
        if (!message) return null;
        await tx
          .delete(transactions)
          .where(and(eq(transactions.userId, userId), eq(transactions.batchId, batchId)));
        await tx
          .delete(chatMessages)
          .where(
            and(
              eq(chatMessages.userId, userId),
              eq(chatMessages.kind, MESSAGE_KIND.remaining),
              sql`${payloadField('batchId')} = ${batchId}`,
            ),
          );
        return message;
      });
    },
  };
}

export const draftBatchRepository = createDraftBatchRepository();
