/**
 * Manual entries' data access (AGENTS.md Rules 4 and 10): a Catat Manual entry with its chat note,
 * and what a client id left behind, so a retry answers the first save.
 */

import { and, eq } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { chatMessages, type MessagePayload, transactions } from '../../db/schema/schema.ts';
import type { MessageRow } from '../../lib/chat/chat-message.ts';
import { MESSAGE_KIND, MESSAGE_SENDER } from '../../lib/constants/chat.ts';
import type { TransactionCategory, TransactionType } from '../../lib/money/money.schema.ts';

export type TransactionRow = {
  id: string;
  type: TransactionType;
  amount: number;
  category: TransactionCategory;
  name: string;
  occurredAt: Date;
  note: string | null;
  source: (typeof transactions.$inferSelect)['source'];
  sourceMessageId: string | null;
};

export type NewTransaction = typeof transactions.$inferInsert & { id: string; clientId: string };

type ManualSaved = { transaction: TransactionRow; message: MessageRow };

type ManualTrace = { transaction: TransactionRow | null; message: MessageRow | null };

export type ManualQueries = {
  findManualByClientId(userId: string, clientId: string): Promise<ManualTrace>;
  /** Null when an entry with the same client id was saved first. */
  createManual(input: {
    transaction: NewTransaction;
    message: MessagePayload;
    now: Date;
  }): Promise<ManualSaved | null>;
};

export const columns = {
  id: transactions.id,
  type: transactions.type,
  amount: transactions.amount,
  category: transactions.category,
  name: transactions.name,
  occurredAt: transactions.occurredAt,
  note: transactions.note,
  source: transactions.source,
  sourceMessageId: transactions.sourceMessageId,
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

export function createManualQueries(client: PostgresJsDatabase): ManualQueries {
  return {
    async findManualByClientId(userId, clientId) {
      const [[transaction], [message]] = await Promise.all([
        client
          .select(columns)
          .from(transactions)
          .where(and(eq(transactions.userId, userId), eq(transactions.clientId, clientId)))
          .limit(1),
        client
          .select(messageColumns)
          .from(chatMessages)
          .where(
            and(
              eq(chatMessages.userId, userId),
              eq(chatMessages.clientId, clientId),
              eq(chatMessages.kind, MESSAGE_KIND.manualSaved),
            ),
          )
          .limit(1),
      ]);
      return { transaction: transaction ?? null, message: message ?? null };
    },

    createManual({ transaction, message, now }) {
      return client.transaction(async (tx) => {
        const [saved] = await tx
          .insert(transactions)
          .values(transaction)
          .onConflictDoNothing({ target: [transactions.userId, transactions.clientId] })
          .returning(columns);
        if (!saved) return null;
        const [note] = await tx
          .insert(chatMessages)
          .values({
            userId: transaction.userId,
            clientId: transaction.clientId,
            sender: MESSAGE_SENDER.kira,
            kind: MESSAGE_KIND.manualSaved,
            payload: message,
            createdAt: now,
          })
          .returning(messageColumns);
        if (!note) throw new Error('The manual entry message was not stored');
        return { transaction: saved, message: note };
      });
    },
  };
}
