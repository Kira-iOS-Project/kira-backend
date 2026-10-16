import { z } from '@hono/zod-openapi';
import {
  chatMessageSchema,
  draftEditSchema,
  draftInputSchema,
} from '../../lib/chat/chat-message.ts';
import { DRAFT_PARSER, INPUT_METHOD } from '../../lib/constants/chat.ts';
import { enumValues } from '../../lib/constants/enum-values.ts';
import { amountSchema, expenseCategorySchema } from '../../lib/money/money.schema.ts';
import { cursorParamSchema, limitParamSchema } from '../../lib/pagination/cursor.ts';
import { usageSchema } from '../../lib/usage/usage.schema.ts';

const MAX_DRAFTS = 20;

export const listMessagesQuerySchema = z.object({
  /** The `nextCursor` of the page before: older messages. */
  before: cursorParamSchema.optional(),
  /** A message to centre the window on (CAT-08f "Riwayat Percakapan"). */
  around: z.uuid().optional(),
  limit: limitParamSchema(50),
});

export const messagePageSchema = z
  .object({
    /** Oldest first. */
    items: z.array(chatMessageSchema),
    nextCursor: z.string().nullable(),
  })
  .openapi('ChatMessagePage');

export const sendMessageBodySchema = z
  .object({
    /** Chosen by the app, so a retried send stores the message once. */
    clientId: z.uuid(),
    text: z.string().trim().min(1).max(1000),
    inputMethod: z.enum(enumValues(INPUT_METHOD)),
    /** The length of the recording, counted against Kira Plus's voice quota. */
    voiceSeconds: z.number().int().min(1).max(600).optional(),
    parser: z.enum(enumValues(DRAFT_PARSER)),
    /** What the device read from the text; empty when it found no amount. */
    drafts: z.array(draftInputSchema).max(MAX_DRAFTS),
  })
  /** A spoken message says how long it was, so the voice quota is always spent. */
  .refine((body) => body.inputMethod !== INPUT_METHOD.voice || body.voiceSeconds !== undefined, {
    path: ['voiceSeconds'],
    message: 'Required for a spoken message',
  })
  .openapi('ChatMessageInput');

export const sendReceiptBodySchema = z
  .object({
    clientId: z.uuid(),
    storeName: z.string().trim().min(1).max(80),
    occurredAt: z.iso.datetime({ offset: true }),
    total: amountSchema,
    items: z
      .array(
        z.object({
          name: z.string().trim().min(1).max(80),
          amount: amountSchema,
          category: expenseCategorySchema,
        }),
      )
      .min(1)
      .max(50),
  })
  .openapi('ReceiptInput');

export const sentResponseSchema = z
  .object({
    person: chatMessageSchema,
    /** Null when the quota ran out: the message is kept and the app shows Kuota AI (CAT-09). */
    reply: chatMessageSchema.nullable(),
    quotaExhausted: z.boolean(),
    usage: usageSchema,
  })
  .openapi('ChatMessageSent');

export const messageIdParamSchema = z.object({ id: z.uuid() });

export const updateDraftsBodySchema = z
  .object({ drafts: z.array(draftEditSchema).max(MAX_DRAFTS) })
  .openapi('DraftsUpdate');

export const committedResponseSchema = z
  .object({ message: chatMessageSchema, remaining: chatMessageSchema })
  .openapi('DraftsCommitted');

export type ListMessagesQuery = z.infer<typeof listMessagesQuerySchema>;
export type MessagePage = z.infer<typeof messagePageSchema>;
export type SendMessageBody = z.infer<typeof sendMessageBodySchema>;
export type SendReceiptBody = z.infer<typeof sendReceiptBodySchema>;
export type SentResponse = z.infer<typeof sentResponseSchema>;
export type DraftEdit = z.infer<typeof draftEditSchema>;
