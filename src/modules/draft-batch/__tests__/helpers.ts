/**
 * Mock builders for the draft-batch module's injected dependencies (AGENTS.md Rule 19).
 */

import type { DraftItem, MessageRow } from '../../../lib/chat/chat-message.ts';
import {
  DRAFT_PARSER,
  DRAFT_STATUS,
  MESSAGE_KIND,
  MESSAGE_SENDER,
} from '../../../lib/constants/chat.ts';
import { EXPENSE_CATEGORY, TRANSACTION_TYPE } from '../../../lib/constants/money.ts';
import type { DraftBatchRepository } from '../draft-batch.repository.ts';

/** 16 October 2026, 12.41 WIB. */
export const NOW = new Date('2026-10-16T05:41:00.000Z');
export const MESSAGE_ID = '1a2b3c4d-0000-4000-8000-000000000001';
export const PERSON_ID = '1a2b3c4d-0000-4000-8000-000000000002';
export const BATCH_ID = '1a2b3c4d-0000-4000-8000-000000000003';

export function createDraftMock(overrides: Partial<DraftItem> = {}): DraftItem {
  return {
    id: '1a2b3c4d-0000-4000-8000-0000000000d1',
    type: TRANSACTION_TYPE.expense,
    name: 'Kopi Susu',
    amount: 25_000,
    category: EXPENSE_CATEGORY.coffee,
    occurredAt: NOW.toISOString(),
    spanStart: 0,
    spanEnd: 9,
    ...overrides,
  };
}

export function createDraftsMessageMock(overrides: Partial<MessageRow> = {}): MessageRow {
  return {
    id: MESSAGE_ID,
    sender: MESSAGE_SENDER.kira,
    kind: MESSAGE_KIND.drafts,
    body: null,
    payload: {
      drafts: [createDraftMock()],
      draftStatus: DRAFT_STATUS.pending,
      parser: DRAFT_PARSER.slangRules,
    },
    replyToId: PERSON_ID,
    createdAt: new Date(NOW.getTime() - 60_000),
    ...overrides,
  };
}

export function createDraftBatchRepositoryMock(
  overrides: Partial<DraftBatchRepository> = {},
): DraftBatchRepository {
  return {
    findDraftsMessage: async () => null,
    findBudgetProfile: async () => ({
      payday: { day: null, endOfMonth: false },
      netMonthlyIncome: null,
    }),
    periodTotals: async () => ({ income: 0, spent: 0 }),
    commit: async () => null,
    findBatch: async () => null,
    undo: async () => null,
    ...overrides,
  };
}
