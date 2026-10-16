import { describe, expect, test } from 'bun:test';
import {
  DRAFT_PARSER,
  DRAFT_STATUS,
  INPUT_METHOD,
  MESSAGE_KIND,
  MESSAGE_SENDER,
} from '../../../lib/constants/chat.ts';
import { EXPENSE_CATEGORY } from '../../../lib/constants/money.ts';
import type { IncomingInput } from '../chat.repository.ts';
import { sendMessage, sendReceipt } from '../chat.service.ts';
import {
  CLIENT_ID,
  createChatRepositoryMock,
  createMessageMock,
  createPlanUsageMock,
  MESSAGE_BODY,
  NOW,
  REPLY_ID,
} from './helpers.ts';

const clock = () => NOW;
const newId = () => '5e0c1d2a-0000-4000-8000-0000000000d1';

/** A repository that stores what it is given and answers it back. */
function storing(stored: IncomingInput[], options: { quotaLeft?: boolean } = {}) {
  return createChatRepositoryMock({
    storeIncoming: async (input) => {
      stored.push(input);
      const person = createMessageMock({ ...input.person });
      const reply = createMessageMock({
        id: REPLY_ID,
        sender: MESSAGE_SENDER.kira,
        body: null,
        ...input.reply,
      });
      return { person, reply: options.quotaLeft === false ? null : reply };
    },
  });
}

const deps = (repository = createChatRepositoryMock(), plus = false) => ({
  repository,
  planUsage: async () => createPlanUsageMock(plus),
  now: clock,
  newId,
});

describe('sendMessage', () => {
  test('stores the message and answers with pending drafts', async () => {
    const stored: IncomingInput[] = [];

    const result = await sendMessage('user-1', MESSAGE_BODY, deps(storing(stored)));

    expect(stored[0]?.quota).toEqual({
      periodStart: '2026-10-01',
      use: { aiMessages: 1, receipts: 0, voiceSeconds: 0 },
      limits: expect.objectContaining({ aiMessages: 30, receipts: 10, voiceSeconds: 0 }),
    });
    expect(stored[0]?.reply.createdAt.getTime()).toBe(NOW.getTime() + 1);
    expect(result.quotaExhausted).toBe(false);
    expect(result.reply?.draftStatus).toBe(DRAFT_STATUS.pending);
    expect(result.reply?.drafts?.[0]).toMatchObject({
      id: newId(),
      occurredAt: '2026-10-16T05:41:00.000Z',
    });
    expect(result.person.parser).toBe(DRAFT_PARSER.slangRules);
    expect(result.usage.aiMessages.limit).toBe(30);
  });

  test('answers no_drafts when the device read no amount', async () => {
    const stored: IncomingInput[] = [];
    const result = await sendMessage(
      'user-1',
      { ...MESSAGE_BODY, drafts: [] },
      deps(storing(stored)),
    );
    expect(result.reply?.kind).toBe(MESSAGE_KIND.noDrafts);
  });

  test('keeps the message and answers nothing when the quota is spent', async () => {
    const result = await sendMessage(
      'user-1',
      MESSAGE_BODY,
      deps(storing([], { quotaLeft: false })),
    );
    expect(result).toMatchObject({ reply: null, quotaExhausted: true });
  });

  test('spends voice seconds on Kira Plus and refuses voice on other plans', async () => {
    const stored: IncomingInput[] = [];
    const voice = { ...MESSAGE_BODY, inputMethod: INPUT_METHOD.voice, voiceSeconds: 42 };

    const result = await sendMessage('user-1', voice, deps(storing(stored), true));
    await sendMessage('user-1', { ...voice, voiceSeconds: undefined }, deps(storing(stored), true));

    expect(stored.map((input) => input.quota.use.voiceSeconds)).toEqual([42, 0]);
    expect(result.person.inputMethod).toBe(INPUT_METHOD.voice);
    await expect(sendMessage('user-1', voice, deps(storing([])))).rejects.toMatchObject({
      statusCode: 403,
      code: 'PLAN_FEATURE_UNAVAILABLE',
    });
  });

  test('refuses when Kira AI is off', async () => {
    const repository = createChatRepositoryMock({ aiConsentGranted: async () => false });
    await expect(sendMessage('user-1', MESSAGE_BODY, deps(repository))).rejects.toMatchObject({
      statusCode: 403,
      code: 'CHAT_AI_DISABLED',
    });
  });

  test('answers a retry with what the first send stored', async () => {
    const person = createMessageMock();
    const repository = createChatRepositoryMock({
      findByClientId: async (_userId, clientId) =>
        clientId === CLIENT_ID ? { person, reply: null } : null,
      aiConsentGranted: async () => false,
    });

    const result = await sendMessage('user-1', MESSAGE_BODY, deps(repository));

    expect(result).toMatchObject({ person: { id: person.id }, reply: null, quotaExhausted: true });
  });

  test('answers a concurrent duplicate from the stored row, and fails when there is none', async () => {
    let lookups = 0;
    const person = createMessageMock();
    const racing = createChatRepositoryMock({
      findByClientId: async () => (lookups++ === 0 ? null : { person, reply: null }),
    });

    expect((await sendMessage('user-1', MESSAGE_BODY, deps(racing))).person.id).toBe(person.id);
    await expect(sendMessage('user-1', MESSAGE_BODY, deps())).rejects.toThrow(
      'The message was neither stored nor found',
    );
  });

  test('reads the real plan, clock and ids by default', async () => {
    const stored: IncomingInput[] = [];
    const result = await sendMessage('user-1', MESSAGE_BODY, { repository: storing(stored) });
    expect(result.usage.aiMessages.limit).toBe(30);
    expect(result.reply?.drafts?.[0]?.id).toMatch(/^[0-9a-f-]{36}$/);
  });
});

describe('sendReceipt', () => {
  const receipt = {
    clientId: CLIENT_ID,
    storeName: 'Indomaret',
    occurredAt: '2026-10-16T12:41:00+07:00',
    total: 30_000,
    items: [
      { name: 'Roti', amount: 12_000, category: EXPENSE_CATEGORY.food },
      { name: 'Sabun', amount: 18_000, category: EXPENSE_CATEGORY.household },
    ],
  };

  test('spends a receipt and answers with one draft per item', async () => {
    const stored: IncomingInput[] = [];

    const result = await sendReceipt('user-1', receipt, deps(storing(stored)));

    expect(stored[0]?.person).toMatchObject({
      kind: MESSAGE_KIND.personReceipt,
      body: 'Indomaret',
    });
    expect(stored[0]?.quota.use).toEqual({ aiMessages: 0, receipts: 1, voiceSeconds: 0 });
    expect(result.reply?.drafts).toHaveLength(2);
    expect(result.reply?.parser).toBeNull();
    expect(result.reply?.drafts?.[1]).toMatchObject({
      name: 'Sabun',
      spanStart: null,
      occurredAt: '2026-10-16T05:41:00.000Z',
    });
  });

  test('refuses items that do not add up to the total', async () => {
    await expect(
      sendReceipt('user-1', { ...receipt, total: 31_000 }, deps()),
    ).rejects.toMatchObject({
      statusCode: 400,
      code: 'RECEIPT_TOTAL_MISMATCH',
    });
  });

  test('uses the real ids by default', async () => {
    const result = await sendReceipt('user-1', receipt, {
      repository: storing([]),
      planUsage: async () => createPlanUsageMock(),
    });
    expect(result.reply?.drafts?.[0]?.id).toMatch(/^[0-9a-f-]{36}$/);
  });
});
