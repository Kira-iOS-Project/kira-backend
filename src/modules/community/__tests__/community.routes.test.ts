/**
 * The community routes through the real app: the session gate, request validation, the real error
 * mapper and the shared Postgres double, answering each statement by its table. One test per
 * problem a route can answer.
 */

import { beforeEach, describe, expect, test } from 'bun:test';
import { app } from '../../../app.ts';
import {
  COMMUNITY_CATEGORY,
  COMMUNITY_PLATFORM,
  COMMUNITY_LISTING_STATUS,
  COMMUNITY_PRODUCT_KIND,
  COMMUNITY_REPORT_REASON,
  COMMUNITY_REPORT_STORY_MAX,
  COMMUNITY_RULES_VERSION,
} from '../../../lib/constants/community.ts';
import type { FakeQuery } from '../../../test/fake-postgres.ts';
import { dbControl, resetExternalMocks } from '../../../test/preload.ts';
import {
  call,
  GROUP_ID,
  groupRow,
  problemOf,
  PRODUCT_ID,
  productRow,
  REPORT_ID,
  world,
} from './helpers.ts';

beforeEach(() => resetExternalMocks());

const GROUP = `/api/community/groups/${GROUP_ID}`;

describe('community routes', () => {
  test('refuse a request without a session', async () => {
    expect((await app.request('/api/community/groups')).status).toBe(401);
  });

  test('GET /community/groups answers the categories and the groups, filtered by category', async () => {
    const seen: FakeQuery[] = [];
    dbControl.respond = world({}, seen);

    const res = await call('GET', `/api/community/groups?category=${COMMUNITY_CATEGORY.debtFree}`);
    const body = (await res.json()) as { categories: unknown[]; groups: { name: string }[] };

    expect(res.status).toBe(200);
    expect(body.categories).toEqual([{ key: COMMUNITY_CATEGORY.debtFree, label: 'Bebas Hutang' }]);
    expect(body.groups.map((group) => group.name)).toEqual(['Lunas Bareng Jakarta']);
    expect(seen.some((query) => query.params.includes(COMMUNITY_CATEGORY.debtFree))).toBe(true);
  });

  test('GET /community/groups refuses an unknown category with 422', async () => {
    dbControl.respond = world({});
    expect((await problemOf(await call('GET', '/api/community/groups?category=forex'))).code).toBe(
      'VALIDATION_FAILED',
    );
  });

  test('GET /community/groups/{id} answers the detail with the rules consent', async () => {
    dbControl.respond = world({ consented: true });

    const res = await call('GET', GROUP);

    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      admin: { name: 'Rani A.', initials: 'RA', verifiedSince: '2026-03' },
      linkCheckedOn: '2026-10-12',
      rulesAccepted: true,
    });
  });

  test('GET /community/groups/{id} answers no link check while the group has no invite', async () => {
    dbControl.respond = world({ group: groupRow({ inviteUrl: null }) });

    const res = await call('GET', GROUP);

    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ linkCheckedOn: null, adminUnchanged: null });
  });

  test('GET /community/groups/{id} answers 404 for a missing or suspended group', async () => {
    dbControl.respond = world({ group: null });
    expect(await problemOf(await call('GET', GROUP))).toEqual({
      status: 404,
      code: 'COMMUNITY_GROUP_NOT_FOUND',
    });
  });

  test('POST /community/rules/consent stores the current version and refuses an older one', async () => {
    const seen: FakeQuery[] = [];
    dbControl.respond = world({}, seen);

    const accepted = await call('POST', '/api/community/rules/consent', {
      version: COMMUNITY_RULES_VERSION,
    });
    const older = await call('POST', '/api/community/rules/consent', {
      version: 'community-2026-01-01',
    });

    expect(accepted.status).toBe(204);
    expect(
      seen.filter((q) => q.sql.startsWith('insert into "community_rules_consents"')),
    ).toHaveLength(1);
    expect(await problemOf(older)).toEqual({ status: 422, code: 'VALIDATION_FAILED' });
  });

  test('POST /community/groups/{id}/join answers the invite once the rules are accepted', async () => {
    dbControl.respond = world({ consented: true });

    const res = await call('POST', `${GROUP}/join`);

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      inviteUrl: 'https://chat.whatsapp.com/J6w5MMRXueBRbTmGiDOI4Z',
      platform: COMMUNITY_PLATFORM.whatsapp,
      linkCheckedOn: '2026-10-12',
    });
  });

  test('POST /community/groups/{id}/join answers 409 before the rules are accepted', async () => {
    dbControl.respond = world({ consented: false });
    expect(await problemOf(await call('POST', `${GROUP}/join`))).toEqual({
      status: 409,
      code: 'COMMUNITY_RULES_NOT_ACCEPTED',
    });
  });

  test('POST /community/groups/{id}/join answers 409 while the group has no verified link', async () => {
    dbControl.respond = world({ consented: true, group: groupRow({ inviteUrl: null }) });
    expect(await problemOf(await call('POST', `${GROUP}/join`))).toEqual({
      status: 409,
      code: 'COMMUNITY_LINK_UNAVAILABLE',
    });
  });

  test('POST /community/groups/{id}/join answers 404 for a missing group', async () => {
    dbControl.respond = world({ consented: true, group: null });
    expect((await problemOf(await call('POST', `${GROUP}/join`))).code).toBe(
      'COMMUNITY_GROUP_NOT_FOUND',
    );
  });

  test('POST /community/groups/{id}/reports answers 201 with the report', async () => {
    dbControl.respond = world({});

    const res = await call('POST', `${GROUP}/reports`, { reason: COMMUNITY_REPORT_REASON.scam });

    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ id: REPORT_ID });
  });

  test('POST /community/groups/{id}/reports answers 409 for a second open report', async () => {
    dbControl.respond = world({ openReport: true });
    const res = await call('POST', `${GROUP}/reports`, { reason: COMMUNITY_REPORT_REASON.scam });
    expect(await problemOf(res)).toEqual({ status: 409, code: 'COMMUNITY_REPORT_DUPLICATE' });
  });

  test('POST /community/groups/{id}/reports answers 404 for a missing or suspended group', async () => {
    dbControl.respond = world({ status: COMMUNITY_LISTING_STATUS.suspended });
    const res = await call('POST', `${GROUP}/reports`, { reason: COMMUNITY_REPORT_REASON.scam });
    expect(await problemOf(res)).toEqual({ status: 404, code: 'COMMUNITY_GROUP_NOT_FOUND' });
  });

  test('POST /community/groups/{id}/reports needs a story for another reason, and a short one', async () => {
    dbControl.respond = world({});
    const other = COMMUNITY_REPORT_REASON.other;

    const missing = await call('POST', `${GROUP}/reports`, { reason: other });
    const blank = await call('POST', `${GROUP}/reports`, { reason: other, story: '   ' });
    const long = await call('POST', `${GROUP}/reports`, {
      reason: COMMUNITY_REPORT_REASON.scam,
      story: 'a'.repeat(COMMUNITY_REPORT_STORY_MAX + 1),
    });
    const told = await call('POST', `${GROUP}/reports`, { reason: other, story: 'Minta transfer' });

    for (const res of [missing, blank, long]) {
      expect(await problemOf(res)).toEqual({ status: 422, code: 'VALIDATION_FAILED' });
    }
    expect(told.status).toBe(201);
  });

  test('GET /community/products answers the summaries, filtered by kind', async () => {
    const seen: FakeQuery[] = [];
    dbControl.respond = world({ product: productRow({ price: null }) }, seen);

    const res = await call(
      'GET',
      `/api/community/products?kind=${COMMUNITY_PRODUCT_KIND.consultation}`,
    );

    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ products: [{ id: PRODUCT_ID, price: null }] });
    expect(seen.some((query) => query.params.includes(COMMUNITY_PRODUCT_KIND.consultation))).toBe(
      true,
    );
  });

  test('GET /community/products/{id} answers the product, with no seller page yet', async () => {
    dbControl.respond = world({ product: productRow({ sellerUrl: null }) });

    const res = await call('GET', `/api/community/products/${PRODUCT_ID}`);

    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ id: PRODUCT_ID, sellerUrl: null, affiliate: true });
  });

  test('GET /community/products/{id} answers 404 for a missing product', async () => {
    dbControl.respond = world({ product: null });
    expect(await problemOf(await call('GET', `/api/community/products/${PRODUCT_ID}`))).toEqual({
      status: 404,
      code: 'COMMUNITY_PRODUCT_NOT_FOUND',
    });
  });
});
