/**
 * Mock builders for the transaction module's injected dependencies (AGENTS.md Rule 19).
 */

import type { MessageRow } from '../../../lib/chat/chat-message.ts';
import { MESSAGE_KIND, MESSAGE_SENDER } from '../../../lib/constants/chat.ts';
import {
  EXPENSE_CATEGORY,
  TRANSACTION_SOURCE,
  TRANSACTION_TYPE,
} from '../../../lib/constants/money.ts';
import type { TransactionRepository, TransactionRow } from '../transaction.repository.ts';

/** 16 October 2026, 12.41 WIB. */
export const NOW = new Date('2026-10-16T05:41:00.000Z');
export const TX_ID = '7c1e2d3f-0000-4000-8000-000000000001';
export const CLIENT_ID = '7c1e2d3f-0000-4000-8000-0000000000c1';
export const SOURCE_ID = '7c1e2d3f-0000-4000-8000-000000000005';

export function createTransactionRowMock(overrides: Partial<TransactionRow> = {}): TransactionRow {
  return {
    id: TX_ID,
    type: TRANSACTION_TYPE.expense,
    amount: 18_000,
    category: EXPENSE_CATEGORY.transport,
    name: 'Grab ke Kantor',
    occurredAt: NOW,
    note: null,
    source: TRANSACTION_SOURCE.manual,
    sourceMessageId: null,
    ...overrides,
  };
}

export function createManualMessageMock(overrides: Partial<MessageRow> = {}): MessageRow {
  return {
    id: '7c1e2d3f-0000-4000-8000-000000000002',
    sender: MESSAGE_SENDER.kira,
    kind: MESSAGE_KIND.manualSaved,
    body: null,
    payload: { transactionIds: [TX_ID], itemCount: 1 },
    replyToId: null,
    createdAt: NOW,
    ...overrides,
  };
}

export function createTransactionRepositoryMock(
  overrides: Partial<TransactionRepository> = {},
): TransactionRepository {
  return {
    findManualByClientId: async () => ({ transaction: null, message: null }),
    createManual: async () => null,
    list: async () => [],
    dailyTotals: async () => [],
    findDetail: async () => null,
    update: async () => null,
    remove: async () => false,
    ...overrides,
  };
}
