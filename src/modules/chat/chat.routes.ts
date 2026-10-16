import { createRoute } from '@hono/zod-openapi';
import { chatMessageSchema } from '../../lib/chat/chat-message.ts';
import { errorResponses } from '../../lib/errors/problem.ts';
import { createRouter } from '../../lib/server/factory.ts';
import { requireSession } from '../auth/index.ts';
import {
  commitDraftsHandler,
  listMessagesHandler,
  sendMessageHandler,
  sendReceiptHandler,
  updateDraftsHandler,
} from './chat.handler.ts';
import {
  committedResponseSchema,
  listMessagesQuerySchema,
  messageIdParamSchema,
  messagePageSchema,
  sendMessageBodySchema,
  sendReceiptBodySchema,
  sentResponseSchema,
  updateDraftsBodySchema,
} from './chat.schema.ts';

const json = <T>(schema: T) => ({ content: { 'application/json': { schema } } });
const common = { tags: ['Catat'], security: [{ bearerAuth: [] }] };

export const listMessagesRoute = createRoute({
  ...common,
  method: 'get',
  path: '/messages',
  operationId: 'listChatMessages',
  summary: 'Read the Catat chat',
  description: 'A page of older messages by `before`, or a window centred on `around`.',
  request: { query: listMessagesQuerySchema },
  responses: {
    200: { ...json(messagePageSchema), description: 'Messages, oldest first' },
    ...errorResponses(401, 404, 422),
  },
});

export const sendMessageRoute = createRoute({
  ...common,
  method: 'post',
  path: '/messages',
  operationId: 'sendChatMessage',
  summary: 'Send a message with the drafts read on the device',
  description:
    'Spends one AI message (and voice seconds). When the quota is spent the message is kept and `reply` is null.',
  request: { body: { ...json(sendMessageBodySchema), required: true } },
  responses: {
    201: { ...json(sentResponseSchema), description: 'Stored, with Kira’s reply' },
    ...errorResponses(401, 403, 422),
  },
});

export const sendReceiptRoute = createRoute({
  ...common,
  method: 'post',
  path: '/receipts',
  operationId: 'sendReceipt',
  summary: 'Send a receipt read on the device',
  description: 'Spends one receipt; the items must add up to the total.',
  request: { body: { ...json(sendReceiptBodySchema), required: true } },
  responses: {
    201: { ...json(sentResponseSchema), description: 'Stored, with Kira’s reply' },
    ...errorResponses(400, 401, 403, 422),
  },
});

export const updateDraftsRoute = createRoute({
  ...common,
  method: 'put',
  path: '/messages/{id}/drafts',
  operationId: 'updateChatDrafts',
  summary: 'Replace a reply’s drafts before saving',
  description: 'An empty list discards the drafts.',
  request: {
    params: messageIdParamSchema,
    body: { ...json(updateDraftsBodySchema), required: true },
  },
  responses: {
    200: { ...json(chatMessageSchema), description: 'The updated reply' },
    ...errorResponses(401, 404, 409, 422),
  },
});

export const commitDraftsRoute = createRoute({
  ...common,
  method: 'post',
  path: '/messages/{id}/commit',
  operationId: 'commitChatDrafts',
  summary: 'Save a reply’s drafts as transactions',
  description: 'Answers with the saved reply and Kira’s engine-computed remaining-money message.',
  request: { params: messageIdParamSchema },
  responses: {
    200: { ...json(committedResponseSchema), description: 'Saved' },
    ...errorResponses(401, 404, 409, 422),
  },
});

export const chatRouter = createRouter();
chatRouter.use('*', requireSession);
chatRouter.openapi(listMessagesRoute, listMessagesHandler);
chatRouter.openapi(sendMessageRoute, sendMessageHandler);
chatRouter.openapi(sendReceiptRoute, sendReceiptHandler);
chatRouter.openapi(updateDraftsRoute, updateDraftsHandler);
chatRouter.openapi(commitDraftsRoute, commitDraftsHandler);
