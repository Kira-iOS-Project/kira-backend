/**
 * Mock builders for the chat module's injected dependencies (AGENTS.md Rule 19).
 */

import type { MessageRow } from '../../../lib/chat/chat-message.ts';
import {
  DRAFT_PARSER,
  INPUT_METHOD,
  MESSAGE_KIND,
  MESSAGE_SENDER,
} from '../../../lib/constants/chat.ts';
import { EXPENSE_CATEGORY, TRANSACTION_TYPE } from '../../../lib/constants/money.ts';
import { PLAN, SUBSCRIPTION_SOURCE, SUBSCRIPTION_STATUS } from '../../../lib/constants/plans.ts';
import { activePlanOf, usageOf } from '../../../lib/usage/plan-usage.ts';
import type { PlanUsage } from '../../usage/index.ts';
import type { ChatRepository } from '../chat.repository.ts';

/** 16 October 2026, 12.41 WIB. */
export const NOW = new Date('2026-10-16T05:41:00.000Z');
export const CLIENT_ID = '5e0c1d2a-0000-4000-8000-0000000000c1';
export const PERSON_ID = '5e0c1d2a-0000-4000-8000-000000000001';
export const REPLY_ID = '5e0c1d2a-0000-4000-8000-000000000002';

export const DRAFT_INPUT = {
  type: TRANSACTION_TYPE.expense,
  name: 'Kopi Susu',
  amount: 25_000,
  category: EXPENSE_CATEGORY.coffee,
  occurredAt: '2026-10-16T12:41:00+07:00',
  spanStart: 0,
  spanEnd: 9,
};

export const MESSAGE_BODY = {
  clientId: CLIENT_ID,
  text: 'kopi susu 25rb',
  inputMethod: INPUT_METHOD.keyboard,
  parser: DRAFT_PARSER.slangRules,
  drafts: [DRAFT_INPUT],
};

export function createMessageMock(overrides: Partial<MessageRow> = {}): MessageRow {
  return {
    id: PERSON_ID,
    sender: MESSAGE_SENDER.person,
    kind: MESSAGE_KIND.personText,
    body: 'kopi susu 25rb',
    payload: {},
    replyToId: null,
    createdAt: NOW,
    ...overrides,
  };
}

export function createPlanUsageMock(plus = false): PlanUsage {
  const rows = plus
    ? [
        {
          plan: PLAN.plus,
          source: SUBSCRIPTION_SOURCE.purchase,
          status: SUBSCRIPTION_STATUS.active,
          currentPeriodStart: new Date('2026-10-04T17:00:00.000Z'),
          currentPeriodEnd: new Date('2026-11-04T17:00:00.000Z'),
        },
      ]
    : [];
  const plan = activePlanOf(rows);
  const period = { start: '2026-10-01', resetsOn: '2026-11-01' };
  return { plan, period, usage: usageOf(null, plan.id, period.resetsOn) };
}

export function createChatRepositoryMock(overrides: Partial<ChatRepository> = {}): ChatRepository {
  return {
    listBefore: async () => [],
    listAround: async () => ({ older: [], newer: [] }),
    findMessage: async () => null,
    findByClientId: async () => null,
    aiConsentGranted: async () => true,
    storeIncoming: async () => null,
    replaceDrafts: async () => null,
    ...overrides,
  };
}
