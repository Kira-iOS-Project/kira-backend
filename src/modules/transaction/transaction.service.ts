/**
 * A single transaction (CAT-04, CAT-08): Catat Manual, which spends no quota and leaves a note in
 * the chat, and the detail, edit and delete of Detail Transaksi.
 */

import { toChatMessage } from '../../lib/chat/chat-message.ts';
import { TRANSACTION_SOURCE } from '../../lib/constants/money.ts';
import { typeOfCategory } from '../../lib/money/money.schema.ts';
import { TransactionNotFoundError } from './transaction.errors.ts';
import {
  type TransactionPatch,
  type TransactionRepository,
  transactionRepository,
  type TransactionRow,
} from './transaction.repository.ts';
import type {
  CreateTransactionBody,
  ManualSavedResponse,
  Transaction,
  TransactionDetail,
  UpdateTransactionBody,
} from './transaction.schema.ts';

export type TransactionDeps = {
  repository?: TransactionRepository;
  now?: () => Date;
  newId?: () => string;
};

export function toTransaction(row: TransactionRow): Transaction {
  return { ...row, occurredAt: row.occurredAt.toISOString() };
}

/** Saves a manual entry; a retry with the same client id answers the first save. */
export async function createManual(
  userId: string,
  body: CreateTransactionBody,
  deps: TransactionDeps = {},
): Promise<ManualSavedResponse> {
  const repository = deps.repository ?? transactionRepository;
  const now = deps.now?.() ?? new Date();
  const id = deps.newId?.() ?? crypto.randomUUID();
  const saved =
    (await repository.findManualByClientId(userId, body.clientId)) ??
    (await repository.createManual({
      transaction: {
        id,
        userId,
        clientId: body.clientId,
        type: body.type,
        amount: body.amount,
        category: body.category,
        name: body.name,
        occurredAt: new Date(body.occurredAt),
        note: body.note ?? null,
        source: TRANSACTION_SOURCE.manual,
      },
      message: { transactionIds: [id], itemCount: 1 },
      now,
    })) ??
    (await repository.findManualByClientId(userId, body.clientId));
  if (!saved) throw new Error('The manual entry was neither saved nor found');
  return { transaction: toTransaction(saved.transaction), message: toChatMessage(saved.message) };
}

export async function getTransaction(
  userId: string,
  id: string,
  deps: TransactionDeps = {},
): Promise<TransactionDetail> {
  const row = await (deps.repository ?? transactionRepository).findDetail(userId, id);
  if (!row) throw new TransactionNotFoundError();
  const { spanStart, spanEnd, sourceBody, sourceCreatedAt, ...transaction } = row;
  return {
    ...toTransaction(transaction),
    sourceMessage:
      transaction.sourceMessageId && sourceCreatedAt
        ? {
            id: transaction.sourceMessageId,
            body: sourceBody,
            createdAt: sourceCreatedAt.toISOString(),
            spanStart,
            spanEnd,
          }
        : null,
  };
}

/** Edits a transaction; a category from the other list turns it the other way. */
export async function updateTransaction(
  userId: string,
  id: string,
  body: UpdateTransactionBody,
  deps: TransactionDeps = {},
): Promise<Transaction> {
  const patch: TransactionPatch = {
    ...(body.name === undefined ? {} : { name: body.name }),
    ...(body.amount === undefined ? {} : { amount: body.amount }),
    ...(body.category === undefined
      ? {}
      : { category: body.category, type: typeOfCategory(body.category) }),
    ...(body.occurredAt === undefined ? {} : { occurredAt: new Date(body.occurredAt) }),
    ...(body.note === undefined ? {} : { note: body.note }),
  };
  const repository = deps.repository ?? transactionRepository;
  const row =
    Object.keys(patch).length > 0
      ? await repository.update(userId, id, patch)
      : await repository.findDetail(userId, id);
  if (!row) throw new TransactionNotFoundError();
  return toTransaction({
    id: row.id,
    type: row.type,
    amount: row.amount,
    category: row.category,
    name: row.name,
    occurredAt: row.occurredAt,
    note: row.note,
    source: row.source,
    sourceMessageId: row.sourceMessageId,
  });
}

export async function deleteTransaction(
  userId: string,
  id: string,
  deps: TransactionDeps = {},
): Promise<void> {
  if (!(await (deps.repository ?? transactionRepository).remove(userId, id))) {
    throw new TransactionNotFoundError();
  }
}
