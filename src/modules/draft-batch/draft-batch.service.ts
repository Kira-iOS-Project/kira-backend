/**
 * Simpan and Urungkan on a Kira reply's drafts (CAT-03, CAT-06): the drafts become one batch of
 * transactions, and Kira answers with the remaining money of the payday period, computed here by
 * the engine and never by a model. Urungkan takes the whole batch back within 30 seconds.
 */

import { type ChatMessage, type DraftItem, toChatMessage } from '../../lib/chat/chat-message.ts';
import { DRAFT_STATUS, MESSAGE_KIND } from '../../lib/constants/chat.ts';
import { TRANSACTION_SOURCE, TRANSACTION_TYPE } from '../../lib/constants/money.ts';
import { paydayPeriod, wibDate, wibStartOfDay } from '../../lib/time/wib.ts';
import {
  BatchNotFoundError,
  DraftsNotPendingError,
  MessageNotFoundError,
  UndoExpiredError,
} from './draft-batch.errors.ts';
import {
  type CommitPlan,
  type DraftBatchRepository,
  draftBatchRepository,
  type NewTransaction,
} from './draft-batch.repository.ts';

/** Longer than the app's 10-second Urungkan, so a slow network still lands. */
export const UNDO_WINDOW_MS = 30_000;

type DraftBatchDeps = {
  repository?: DraftBatchRepository;
  now?: () => Date;
  newId?: () => string;
};

function resolve(deps: DraftBatchDeps) {
  return {
    repository: deps.repository ?? draftBatchRepository,
    now: deps.now?.() ?? new Date(),
    newId: deps.newId ?? (() => crypto.randomUUID()),
  };
}

export type RemainingMoney = { income: number; spent: number; remaining: number; perDay: number };

/**
 * Sisa uang: the period's income (or the health-check income before any is recorded) less what was
 * spent, and what that leaves per day until payday, today included.
 */
export function remainingMoney(input: {
  recordedIncome: number;
  netMonthlyIncome: number | null;
  spent: number;
  daysLeft: number;
}): RemainingMoney {
  const income = input.recordedIncome > 0 ? input.recordedIncome : (input.netMonthlyIncome ?? 0);
  const remaining = income - input.spent;
  return {
    income,
    spent: input.spent,
    remaining,
    perDay: Math.floor(remaining / Math.max(1, input.daysLeft)),
  };
}

function sumOf(drafts: DraftItem[], type: DraftItem['type']): number {
  return drafts.filter((draft) => draft.type === type).reduce((sum, d) => sum + d.amount, 0);
}

async function budgetAfter(
  repository: DraftBatchRepository,
  userId: string,
  drafts: DraftItem[],
  now: Date,
) {
  const profile = await repository.findBudgetProfile(userId);
  const period = paydayPeriod(wibDate(now), profile.payday);
  const totals = await repository.periodTotals(
    userId,
    wibStartOfDay(period.start),
    wibStartOfDay(period.nextPayday),
  );
  const inPeriod = drafts.filter((draft) => {
    const date = wibDate(new Date(draft.occurredAt));
    return date >= period.start && date <= period.end;
  });
  return remainingMoney({
    recordedIncome: totals.income + sumOf(inPeriod, TRANSACTION_TYPE.income),
    netMonthlyIncome: profile.netMonthlyIncome,
    spent: totals.spent + sumOf(inPeriod, TRANSACTION_TYPE.expense),
    daysLeft: period.daysUntilPayday,
  });
}

/** A reply's payload, as stored. */
type MessagePayload = CommitPlan['payload'];

function isPending(payload: MessagePayload): boolean {
  return payload.draftStatus === DRAFT_STATUS.pending && (payload.drafts ?? []).length > 0;
}

/**
 * Saves a pending reply's drafts as transactions and answers with the remaining money. The save is
 * built from the drafts as locked inside the saving transaction, so an edit that lands while it
 * runs is either saved or refused, never silently dropped.
 */
export async function commitDrafts(
  userId: string,
  messageId: string,
  deps: DraftBatchDeps = {},
): Promise<{ message: ChatMessage; remaining: ChatMessage }> {
  const { repository, now, newId } = resolve(deps);
  const found = await repository.findDraftsMessage(userId, messageId);
  if (!found) throw new MessageNotFoundError();
  const { message, sourceKind } = found;
  if (message.kind !== MESSAGE_KIND.drafts) throw new DraftsNotPendingError('not a drafts reply');
  if (!isPending(message.payload)) throw new DraftsNotPendingError('already settled');
  const source =
    sourceKind === MESSAGE_KIND.personReceipt
      ? TRANSACTION_SOURCE.receipt
      : TRANSACTION_SOURCE.chat;
  const saved = await repository.commit({ userId, messageId, now }, async (locked) =>
    isPending(locked)
      ? planCommit({ userId, locked, replyToId: message.replyToId, source, now, newId, repository })
      : null,
  );
  if (!saved) throw new DraftsNotPendingError('settled during the save');
  return { message: toChatMessage(saved.message), remaining: toChatMessage(saved.remaining) };
}

/** The transactions and messages a save writes, from the drafts as locked. */
async function planCommit(input: {
  userId: string;
  locked: MessagePayload;
  replyToId: string | null;
  source: NewTransaction['source'];
  now: Date;
  newId: () => string;
  repository: DraftBatchRepository;
}): Promise<CommitPlan> {
  const { userId, locked, source, now, newId, repository } = input;
  const drafts = locked.drafts ?? [];
  const budget = await budgetAfter(repository, userId, drafts, now);
  const batchId = newId();
  const rows: NewTransaction[] = drafts.map((draft) => ({
    id: newId(),
    userId,
    type: draft.type,
    amount: draft.amount,
    category: draft.category,
    name: draft.name,
    occurredAt: new Date(draft.occurredAt),
    source,
    sourceMessageId: input.replyToId,
    sourceSpanStart: draft.spanStart,
    sourceSpanEnd: draft.spanEnd,
    batchId,
  }));
  return {
    payload: {
      ...locked,
      draftStatus: DRAFT_STATUS.committed,
      batchId,
      transactionIds: rows.map((row) => row.id),
      committedAt: now.toISOString(),
    },
    transactions: rows,
    remainingPayload: {
      batchId,
      itemCount: rows.length,
      remaining: budget.remaining,
      perDay: budget.perDay,
    },
  };
}

/** Urungkan: deletes a batch's transactions and puts its drafts back to pending. */
export async function undoBatch(
  userId: string,
  batchId: string,
  deps: DraftBatchDeps = {},
): Promise<ChatMessage> {
  const { repository, now } = resolve(deps);
  const message = await repository.findBatch(userId, batchId);
  if (!message) throw new BatchNotFoundError();
  const committedAt = Date.parse(message.payload.committedAt ?? '');
  if (!(now.getTime() - committedAt <= UNDO_WINDOW_MS)) throw new UndoExpiredError();
  const { transactionIds: _ids, ...payload } = message.payload;
  const restored = await repository.undo({
    userId,
    messageId: message.id,
    batchId,
    payload: { ...payload, draftStatus: DRAFT_STATUS.pending, batchId: null, committedAt: null },
  });
  if (!restored) throw new BatchNotFoundError();
  return toChatMessage(restored);
}
