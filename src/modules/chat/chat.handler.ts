import type { RouteHandler } from '@hono/zod-openapi';
import type { AppEnv } from '../../lib/server/factory.ts';
import { commitDrafts } from '../draft-batch/index.ts';
import { listMessages, updateDrafts } from './chat.history.service.ts';
import type {
  commitDraftsRoute,
  listMessagesRoute,
  sendMessageRoute,
  sendReceiptRoute,
  updateDraftsRoute,
} from './chat.routes.ts';
import { sendMessage, sendReceipt } from './chat.service.ts';

export const listMessagesHandler: RouteHandler<typeof listMessagesRoute, AppEnv> = async (c) => {
  return c.json(await listMessages(c.get('userId'), c.req.valid('query')), 200);
};

export const sendMessageHandler: RouteHandler<typeof sendMessageRoute, AppEnv> = async (c) => {
  return c.json(await sendMessage(c.get('userId'), c.req.valid('json')), 201);
};

export const sendReceiptHandler: RouteHandler<typeof sendReceiptRoute, AppEnv> = async (c) => {
  return c.json(await sendReceipt(c.get('userId'), c.req.valid('json')), 201);
};

export const updateDraftsHandler: RouteHandler<typeof updateDraftsRoute, AppEnv> = async (c) => {
  const { id } = c.req.valid('param');
  return c.json(await updateDrafts(c.get('userId'), id, c.req.valid('json').drafts), 200);
};

export const commitDraftsHandler: RouteHandler<typeof commitDraftsRoute, AppEnv> = async (c) => {
  return c.json(await commitDrafts(c.get('userId'), c.req.valid('param').id), 200);
};
