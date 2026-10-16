/**
 * The transaction module's data access (AGENTS.md Rules 4 and 10): the Riwayat list and its daily
 * totals, and a transaction's detail, edit and delete; manual entries are in
 * transaction-manual.repository.ts.
 */

import { and, desc, eq, gte, ilike, lt, or, sql } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { db } from '../../db/client/index.ts';
import { chatMessages, transactions } from '../../db/schema/schema.ts';
import { TRANSACTION_TYPE } from '../../lib/constants/money.ts';
import type { TransactionCategory, TransactionType } from '../../lib/money/money.schema.ts';
import type { Cursor } from '../../lib/pagination/cursor.ts';
import {
  columns,
  createManualQueries,
  type ManualQueries,
  type TransactionRow,
} from './transaction-manual.repository.ts';

export type { NewTransaction, TransactionRow } from './transaction-manual.repository.ts';

type DetailRow = TransactionRow & {
  spanStart: number | null;
  spanEnd: number | null;
  sourceBody: string | null;
  sourceCreatedAt: Date | null;
};

export type TransactionFilters = {
  from?: Date;
  to?: Date;
  type?: TransactionType;
  category?: TransactionCategory;
  q?: string;
};
export type TransactionPatch = Partial<
  Pick<TransactionRow, 'name' | 'amount' | 'category' | 'type' | 'occurredAt' | 'note'>
>;
/** What a manual entry's client id left behind: its transaction (unless deleted) and its note. */
type DayTotals = { date: string; expense: number; income: number };

export type TransactionRepository = ManualQueries & {
  /** Newest first, strictly after the cursor. */
  list(
    userId: string,
    filters: TransactionFilters,
    cursor: Cursor | null,
    limit: number,
  ): Promise<TransactionRow[]>;
  /** Totals per WIB day within [from, to). */
  dailyTotals(userId: string, from: Date, to: Date): Promise<DayTotals[]>;
  findDetail(userId: string, id: string): Promise<DetailRow | null>;
  update(userId: string, id: string, patch: TransactionPatch): Promise<TransactionRow | null>;
  remove(userId: string, id: string): Promise<boolean>;
};

const WIB_DAY = sql<string>`to_char(${transactions.occurredAt} at time zone 'Asia/Jakarta', 'YYYY-MM-DD')`;

function totalOf(type: TransactionType) {
  return sql<number>`coalesce(sum(${transactions.amount}) filter (where ${transactions.type} = ${type}), 0)`.mapWith(
    Number,
  );
}

function mine(userId: string, id: string) {
  return and(eq(transactions.userId, userId), eq(transactions.id, id));
}

function filtersOf(userId: string, filters: TransactionFilters, cursor: Cursor | null) {
  const pattern = filters.q && `%${filters.q.replaceAll(/[\\%_]/g, (char) => `\\${char}`)}%`;
  return and(
    eq(transactions.userId, userId),
    filters.from && gte(transactions.occurredAt, filters.from),
    filters.to && lt(transactions.occurredAt, filters.to),
    filters.type && eq(transactions.type, filters.type),
    filters.category && eq(transactions.category, filters.category),
    pattern ? ilike(transactions.name, pattern) : undefined,
    cursor
      ? or(
          lt(transactions.occurredAt, cursor.at),
          and(eq(transactions.occurredAt, cursor.at), lt(transactions.id, cursor.id)),
        )
      : undefined,
  );
}

export function createTransactionRepository(
  client: PostgresJsDatabase = db,
): TransactionRepository {
  return {
    ...createManualQueries(client),

    list: (userId, filters, cursor, limit) =>
      client
        .select(columns)
        .from(transactions)
        .where(filtersOf(userId, filters, cursor))
        .orderBy(desc(transactions.occurredAt), desc(transactions.id))
        .limit(limit),

    dailyTotals: (userId, from, to) =>
      client
        .select({
          date: WIB_DAY,
          expense: totalOf(TRANSACTION_TYPE.expense),
          income: totalOf(TRANSACTION_TYPE.income),
        })
        .from(transactions)
        .where(filtersOf(userId, { from, to }, null))
        .groupBy(WIB_DAY)
        .orderBy(WIB_DAY)
        .limit(400),

    async findDetail(userId, id) {
      const [row] = await client
        .select({
          ...columns,
          spanStart: transactions.sourceSpanStart,
          spanEnd: transactions.sourceSpanEnd,
          sourceBody: chatMessages.body,
          sourceCreatedAt: chatMessages.createdAt,
        })
        .from(transactions)
        .leftJoin(
          chatMessages,
          and(
            eq(chatMessages.id, transactions.sourceMessageId),
            eq(chatMessages.userId, transactions.userId),
          ),
        )
        .where(mine(userId, id))
        .limit(1);
      return row ?? null;
    },

    async update(userId, id, patch) {
      const [row] = await client
        .update(transactions)
        .set(patch)
        .where(mine(userId, id))
        .returning(columns);
      return row ?? null;
    },

    async remove(userId, id) {
      const rows = await client
        .delete(transactions)
        .where(mine(userId, id))
        .returning({ id: transactions.id });
      return rows.length > 0;
    },
  };
}

export const transactionRepository = createTransactionRepository();
