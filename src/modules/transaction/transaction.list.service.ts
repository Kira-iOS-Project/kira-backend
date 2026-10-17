/**
 * Riwayat Transaksi (CAT-07): the list, newest first by cursor, and the engine's totals out and in
 * for a range of WIB days.
 */

import { decodeCursor, encodeCursor } from '../../lib/pagination/cursor.ts';
import { addDays, wibStartOfDay } from '../../lib/time/wib.ts';
import { type TransactionRepository, transactionRepository } from './transaction.repository.ts';
import type {
  ListTransactionsQuery,
  TransactionPage,
  TransactionSummary,
} from './transaction.schema.ts';
import { toTransaction } from './transaction.service.ts';

type ListDeps = { repository?: TransactionRepository };

export async function listTransactions(
  userId: string,
  query: ListTransactionsQuery,
  deps: ListDeps = {},
): Promise<TransactionPage> {
  const repository = deps.repository ?? transactionRepository;
  const rows = await repository.list(
    userId,
    {
      ...(query.from ? { from: wibStartOfDay(query.from) } : {}),
      ...(query.to ? { to: wibStartOfDay(addDays(query.to, 1)) } : {}),
      ...(query.type ? { type: query.type } : {}),
      ...(query.category ? { category: query.category } : {}),
      ...(query.q ? { q: query.q } : {}),
    },
    query.cursor ? decodeCursor(query.cursor) : null,
    query.limit + 1,
  );
  const items = rows.slice(0, query.limit);
  const last = items.at(-1);
  return {
    items: items.map(toTransaction),
    nextCursor:
      rows.length > query.limit && last ? encodeCursor({ at: last.occurredAt, id: last.id }) : null,
  };
}

export async function summarizeTransactions(
  userId: string,
  range: { from: string; to: string },
  deps: ListDeps = {},
): Promise<TransactionSummary> {
  const days = await (deps.repository ?? transactionRepository).dailyTotals(
    userId,
    wibStartOfDay(range.from),
    wibStartOfDay(addDays(range.to, 1)),
  );
  return {
    expense: days.reduce((sum, day) => sum + day.expense, 0),
    income: days.reduce((sum, day) => sum + day.income, 0),
    days,
  };
}
