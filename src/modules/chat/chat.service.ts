/**
 * Sending to Kira (CAT-01, CAT-06, CAT-10): the device has already read the text, the receipt or
 * the recording; the server checks consent and plan, spends the quota, stores the person's message
 * and answers with the drafts to confirm. A spent quota keeps the message and answers nothing
 * (CAT-09). A retried send with the same client id answers what the first one stored.
 */

import type { DraftItem } from '../../lib/chat/chat-message.ts';
import { toChatMessage } from '../../lib/chat/chat-message.ts';
import { DRAFT_STATUS, INPUT_METHOD, MESSAGE_KIND } from '../../lib/constants/chat.ts';
import { TRANSACTION_TYPE } from '../../lib/constants/money.ts';
import { PLAN_TERMS } from '../../lib/constants/plans.ts';
import type { UsageCounters } from '../../lib/usage/plan-usage.ts';
import { currentPlanUsage, type PlanUsage, requireVoiceAndImport } from '../usage/index.ts';
import { AiDisabledError, ReceiptTotalMismatchError } from './chat.errors.ts';
import {
  type ChatRepository,
  chatRepository,
  type Exchange,
  type NewMessage,
} from './chat.repository.ts';
import type { SendMessageBody, SendReceiptBody, SentResponse } from './chat.schema.ts';

type PlanUsageOf = (userId: string) => Promise<PlanUsage>;

export type ChatDeps = {
  repository?: ChatRepository;
  planUsage?: PlanUsageOf;
  now?: () => Date;
  newId?: () => string;
};

function resolve(deps: ChatDeps) {
  return {
    repository: deps.repository ?? chatRepository,
    planUsage: deps.planUsage ?? ((userId: string) => currentPlanUsage(userId)),
    now: deps.now?.() ?? new Date(),
    newId: deps.newId ?? (() => crypto.randomUUID()),
  };
}

type Incoming = {
  person: Omit<NewMessage, 'createdAt'>;
  reply: Omit<NewMessage, 'createdAt' | 'body'>;
  use: UsageCounters;
  /** A Kira Plus feature the message needs. */
  feature?: string;
};

async function answer(exchange: Exchange, userId: string, planUsage: PlanUsageOf) {
  const { usage } = await planUsage(userId);
  return {
    person: toChatMessage(exchange.person),
    reply: exchange.reply ? toChatMessage(exchange.reply) : null,
    quotaExhausted: exchange.reply === null,
    usage,
  };
}

async function receive(
  userId: string,
  clientId: string,
  incoming: Incoming,
  deps: ChatDeps,
): Promise<SentResponse> {
  const { repository, planUsage, now } = resolve(deps);
  const replay = await repository.findByClientId(userId, clientId);
  if (replay) return answer(replay, userId, planUsage);
  if (!(await repository.aiConsentGranted(userId))) throw new AiDisabledError();
  const { plan, period } = await planUsage(userId);
  if (incoming.feature) requireVoiceAndImport(plan, incoming.feature);
  const stored = await repository.storeIncoming({
    userId,
    clientId,
    person: { ...incoming.person, createdAt: now },
    /** A millisecond later, so the history orders the reply after the message it answers. */
    reply: { ...incoming.reply, createdAt: new Date(now.getTime() + 1) },
    quota: { periodStart: period.start, use: incoming.use, limits: PLAN_TERMS[plan.id] },
  });
  const settled = stored ?? (await repository.findByClientId(userId, clientId));
  if (!settled) throw new Error('The message was neither stored nor found');
  return answer(settled, userId, planUsage);
}

function draftsReply(drafts: DraftItem[], parser: SendMessageBody['parser'] | undefined) {
  if (drafts.length === 0) return { kind: MESSAGE_KIND.noDrafts, payload: {} };
  return {
    kind: MESSAGE_KIND.drafts,
    payload: { drafts, draftStatus: DRAFT_STATUS.pending, ...(parser ? { parser } : {}) },
  };
}

/** A typed or spoken message with the drafts the device read from it. */
export async function sendMessage(
  userId: string,
  body: SendMessageBody,
  deps: ChatDeps = {},
): Promise<SentResponse> {
  const { newId } = resolve(deps);
  const voice = body.inputMethod === INPUT_METHOD.voice;
  const voiceSeconds = voice ? (body.voiceSeconds ?? 0) : 0;
  const drafts = body.drafts.map((draft) => ({
    ...draft,
    id: newId(),
    occurredAt: new Date(draft.occurredAt).toISOString(),
  }));
  return receive(
    userId,
    body.clientId,
    {
      person: {
        kind: MESSAGE_KIND.personText,
        body: body.text,
        payload: {
          parser: body.parser,
          inputMethod: body.inputMethod,
          ...(voice ? { voiceSeconds } : {}),
        },
      },
      reply: draftsReply(drafts, body.parser),
      use: { aiMessages: 1, receipts: 0, voiceSeconds },
      ...(voice ? { feature: INPUT_METHOD.voice } : {}),
    },
    deps,
  );
}

/** A receipt read on the device: its items become drafts once they add up to the total. */
export async function sendReceipt(
  userId: string,
  body: SendReceiptBody,
  deps: ChatDeps = {},
): Promise<SentResponse> {
  const sum = body.items.reduce((total, item) => total + item.amount, 0);
  if (sum !== body.total) throw new ReceiptTotalMismatchError(body.total, sum);
  const { newId } = resolve(deps);
  const occurredAt = new Date(body.occurredAt).toISOString();
  const drafts = body.items.map((item) => ({
    id: newId(),
    type: TRANSACTION_TYPE.expense,
    name: item.name,
    amount: item.amount,
    category: item.category,
    occurredAt,
    spanStart: null,
    spanEnd: null,
  }));
  return receive(
    userId,
    body.clientId,
    {
      person: { kind: MESSAGE_KIND.personReceipt, body: body.storeName, payload: {} },
      reply: draftsReply(drafts, undefined),
      use: { aiMessages: 0, receipts: 1, voiceSeconds: 0 },
    },
    deps,
  );
}
