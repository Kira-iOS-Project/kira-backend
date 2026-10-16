/**
 * The chat routes through the real app, the session gate and the shared Postgres double.
 */

import { beforeEach, describe, expect, test } from 'bun:test';
import { app } from '../../../app.ts';
import {
  DRAFT_STATUS,
  INPUT_METHOD,
  MESSAGE_KIND,
  MESSAGE_SENDER,
} from '../../../lib/constants/chat.ts';
import { EXPENSE_CATEGORY } from '../../../lib/constants/money.ts';
import { inOrder } from '../../../test/fake-postgres.ts';
import { dbControl, resetExternalMocks } from '../../../test/preload.ts';
import { AUTH_HEADER, signedIn } from '../../../test/session.ts';
import { CLIENT_ID, createMessageMock, MESSAGE_BODY, PERSON_ID, REPLY_ID } from './helpers.ts';

beforeEach(() => resetExternalMocks());

function send(method: string, path: string, body?: unknown) {
  return app.request(path, {
    method,
    headers: { 'Content-Type': 'application/json', ...AUTH_HEADER },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

const row = (overrides = {}) => {
  const message = createMessageMock(overrides);
  return { ...message, createdAt: message.createdAt.toISOString() };
};

describe('GET /api/chat/messages', () => {
  test('answers a page of the history', async () => {
    dbControl.respond = signedIn(inOrder([row()]));

    const res = await send('GET', '/api/chat/messages?limit=10');
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toMatchObject({
      items: [{ id: PERSON_ID, kind: MESSAGE_KIND.personText }],
      nextCursor: null,
    });
  });

  test('refuses a cursor it did not mint with a 422', async () => {
    dbControl.respond = signedIn();
    expect((await send('GET', '/api/chat/messages?before=nonsense')).status).toBe(422);
  });
});

describe('POST /api/chat/messages', () => {
  test('stores the message and answers 201 with the reply and usage', async () => {
    const reply = row({
      id: REPLY_ID,
      sender: MESSAGE_SENDER.kira,
      kind: MESSAGE_KIND.noDrafts,
      body: null,
    });
    dbControl.respond = signedIn(
      inOrder(
        [],
        [{ granted: true }],
        [],
        [],
        [row()],
        [{ userId: 'u' }],
        [reply],
        [],
        [{ aiMessages: 1, receipts: 0, voiceSeconds: 0 }],
      ),
    );

    const res = await send('POST', '/api/chat/messages', { ...MESSAGE_BODY, drafts: [] });
    const body = await res.json();

    expect(res.status).toBe(201);
    expect(body.reply.kind).toBe(MESSAGE_KIND.noDrafts);
    expect(body.usage.aiMessages).toEqual({ used: 1, limit: 30 });
  });

  test('refuses a spoken message without its length with a 422', async () => {
    dbControl.respond = signedIn();
    const res = await send('POST', '/api/chat/messages', {
      ...MESSAGE_BODY,
      inputMethod: INPUT_METHOD.voice,
      voiceSeconds: undefined,
    });

    expect(res.status).toBe(422);
    expect((await res.json()).fields).toEqual({ voiceSeconds: 'custom' });
  });

  test('answers 403 when Kira AI is off', async () => {
    dbControl.respond = signedIn();
    const res = await send('POST', '/api/chat/messages', MESSAGE_BODY);
    expect(res.status).toBe(403);
    expect((await res.json()).code).toBe('CHAT_AI_DISABLED');
  });
});

describe('POST /api/chat/receipts', () => {
  test('answers 400 when the items do not add up', async () => {
    dbControl.respond = signedIn();
    const res = await send('POST', '/api/chat/receipts', {
      clientId: CLIENT_ID,
      storeName: 'Indomaret',
      occurredAt: '2026-10-16T12:41:00+07:00',
      total: 10_000,
      items: [{ name: 'Roti', amount: 9_000, category: EXPENSE_CATEGORY.food }],
    });
    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe('RECEIPT_TOTAL_MISMATCH');
  });
});

describe('PUT /api/chat/messages/{id}/drafts', () => {
  test('answers 409 for drafts that are already settled', async () => {
    dbControl.respond = signedIn(
      inOrder([
        row({ kind: MESSAGE_KIND.drafts, payload: { draftStatus: DRAFT_STATUS.committed } }),
      ]),
    );
    const res = await send('PUT', `/api/chat/messages/${REPLY_ID}/drafts`, { drafts: [] });
    expect(res.status).toBe(409);
  });
});

describe('POST /api/chat/messages/{id}/commit', () => {
  test('answers 404 for an unknown message', async () => {
    dbControl.respond = signedIn();
    const res = await send('POST', `/api/chat/messages/${REPLY_ID}/commit`);
    expect(res.status).toBe(404);
    expect((await res.json()).code).toBe('CHAT_MESSAGE_NOT_FOUND');
  });
});
