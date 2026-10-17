import { describe, expect, test } from 'bun:test';
import {
  DRAFT_PARSER,
  DRAFT_STATUS,
  INPUT_METHOD,
  MESSAGE_KIND,
  MESSAGE_SENDER,
} from '../../constants/chat.ts';
import { EXPENSE_CATEGORY, INCOME_CATEGORY, TRANSACTION_TYPE } from '../../constants/money.ts';
import { draftEditSchema, draftInputSchema, toChatMessage } from '../chat-message.ts';

const ID = '3f1d2c4b-5a6e-4f70-8b91-a2c3d4e5f607';
const AT = new Date('2026-10-16T05:41:00.000Z');
const DRAFT = {
  type: TRANSACTION_TYPE.expense,
  name: 'Kopi',
  amount: 25_000,
  category: EXPENSE_CATEGORY.coffee,
  occurredAt: '2026-10-16T12:41:00+07:00',
  spanStart: 0,
  spanEnd: 9,
};

describe('draft schemas', () => {
  test('accept a draft whose category fits its type', () => {
    expect(draftInputSchema.safeParse(DRAFT).success).toBe(true);
    expect(draftEditSchema.safeParse({ ...DRAFT, id: ID }).success).toBe(true);
  });

  test('refuse a category from the other direction', () => {
    const wrong = { ...DRAFT, category: INCOME_CATEGORY.salary };
    expect(draftInputSchema.safeParse(wrong).success).toBe(false);
    expect(draftEditSchema.safeParse({ ...wrong, id: ID }).success).toBe(false);
  });
});

describe('toChatMessage', () => {
  const row = {
    id: ID,
    sender: MESSAGE_SENDER.kira,
    kind: MESSAGE_KIND.drafts,
    body: null,
    replyToId: ID,
    createdAt: AT,
  };

  test('nulls every field the kind does not use', () => {
    expect(toChatMessage({ ...row, payload: {} })).toMatchObject({
      createdAt: AT.toISOString(),
      drafts: null,
      draftStatus: null,
      parser: null,
      inputMethod: null,
      batchId: null,
      transactionIds: null,
      committedAt: null,
      itemCount: null,
      remaining: null,
      perDay: null,
    });
  });

  test('copies the payload fields a kind fills', () => {
    const payload = {
      drafts: [{ ...DRAFT, id: ID }],
      draftStatus: DRAFT_STATUS.committed,
      parser: DRAFT_PARSER.slangRules,
      inputMethod: INPUT_METHOD.keyboard,
      batchId: ID,
      transactionIds: [ID],
      committedAt: AT.toISOString(),
      itemCount: 1,
      remaining: 1_792_000,
      perDay: 119_466,
    };
    expect(toChatMessage({ ...row, payload })).toMatchObject(payload);
  });
});
