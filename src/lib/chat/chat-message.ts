/**
 * The `ChatMessage` the Catat chat shows (CAT-01 to CAT-06): its OpenAPI shape, the drafts a Kira
 * reply carries, and the mapping from a stored `chat_messages` row. Fields a kind does not use are
 * null. Shared by the chat, draft-batch and transaction modules, which all answer with messages.
 */

import { z } from '@hono/zod-openapi';
import type { MessagePayload } from '../../db/schema/ledger.ts';
import {
  DRAFT_PARSER,
  DRAFT_STATUS,
  INPUT_METHOD,
  MESSAGE_KIND,
  MESSAGE_SENDER,
} from '../constants/chat.ts';
import { enumValues } from '../constants/enum-values.ts';
import {
  amountSchema,
  CATEGORY_MISMATCH,
  categoryFitsType,
  transactionCategorySchema,
  transactionTypeSchema,
} from '../money/money.schema.ts';

type Values<T> = T[keyof T];

const draftFields = z.object({
  type: transactionTypeSchema,
  name: z.string().trim().min(1).max(80),
  amount: amountSchema,
  category: transactionCategorySchema,
  occurredAt: z.iso.datetime({ offset: true }),
  /** The characters of the source text this item was read from, for the highlighted quote. */
  spanStart: z.number().int().min(0).max(10_000).nullable().default(null),
  spanEnd: z.number().int().min(0).max(10_000).nullable().default(null),
});

const fitsType = (draft: z.infer<typeof draftFields>) =>
  categoryFitsType(draft.type, draft.category);

export const draftInputSchema = draftFields
  .refine(fitsType, CATEGORY_MISMATCH)
  .openapi('DraftInput');

export const draftEditSchema = draftFields
  .extend({ id: z.uuid() })
  .refine(fitsType, CATEGORY_MISMATCH)
  .openapi('DraftEdit');

const draftItemSchema = draftFields.extend({ id: z.uuid() }).openapi('DraftItem');

export const chatMessageSchema = z
  .object({
    id: z.uuid(),
    sender: z.enum(enumValues(MESSAGE_SENDER)),
    kind: z.enum(enumValues(MESSAGE_KIND)),
    body: z.string().nullable(),
    createdAt: z.iso.datetime(),
    replyToId: z.uuid().nullable(),
    drafts: z.array(draftItemSchema).nullable(),
    draftStatus: z.enum(enumValues(DRAFT_STATUS)).nullable(),
    parser: z.enum(enumValues(DRAFT_PARSER)).nullable(),
    inputMethod: z.enum(enumValues(INPUT_METHOD)).nullable(),
    batchId: z.uuid().nullable(),
    transactionIds: z.array(z.uuid()).nullable(),
    committedAt: z.iso.datetime().nullable(),
    itemCount: z.number().int().nullable(),
    /** Sisa uang after a save, computed by the engine (CAT-03); negative when overspent. */
    remaining: z.number().int().nullable(),
    perDay: z.number().int().nullable(),
  })
  .openapi('ChatMessage');

export type ChatMessage = z.infer<typeof chatMessageSchema>;
export type DraftItem = z.infer<typeof draftItemSchema>;

/** The columns of a `chat_messages` row a message is built from. */
export type MessageRow = {
  id: string;
  sender: Values<typeof MESSAGE_SENDER>;
  kind: Values<typeof MESSAGE_KIND>;
  body: string | null;
  payload: MessagePayload;
  replyToId: string | null;
  createdAt: Date;
};

export function toChatMessage(row: MessageRow): ChatMessage {
  const { payload } = row;
  return {
    id: row.id,
    sender: row.sender,
    kind: row.kind,
    body: row.body,
    createdAt: row.createdAt.toISOString(),
    replyToId: row.replyToId,
    drafts: payload.drafts ?? null,
    draftStatus: payload.draftStatus ?? null,
    parser: payload.parser ?? null,
    inputMethod: payload.inputMethod ?? null,
    batchId: payload.batchId ?? null,
    transactionIds: payload.transactionIds ?? null,
    committedAt: payload.committedAt ?? null,
    itemCount: payload.itemCount ?? null,
    remaining: payload.remaining ?? null,
    perDay: payload.perDay ?? null,
  };
}
