/**
 * What the community routes refuse before any work: no session, a malformed id or filter, a
 * missing or unknown report reason, and a story too long or blank as a person reads it.
 */

import { beforeEach, describe, expect, test } from 'bun:test';
import { app } from '../../../app.ts';
import {
  COMMUNITY_REPORT_REASON,
  COMMUNITY_REPORT_STORY_MAX,
} from '../../../lib/constants/community.ts';
import { dbControl, resetExternalMocks } from '../../../test/preload.ts';
import { call, GROUP_ID, PRODUCT_ID, problemOf, REPORT_ID, world } from './helpers.ts';

beforeEach(() => {
  resetExternalMocks();
  dbControl.respond = world({});
});

const GROUP = `/api/community/groups/${GROUP_ID}`;
const REPORTS = `${GROUP}/reports`;
const INVALID = { status: 422, code: 'VALIDATION_FAILED' };

describe('community routes without a session', () => {
  test('answer 401 on every route', async () => {
    const routes: [string, string][] = [
      ['GET', '/api/community/groups'],
      ['GET', GROUP],
      ['POST', '/api/community/rules/consent'],
      ['POST', `${GROUP}/join`],
      ['POST', REPORTS],
      ['GET', '/api/community/products'],
      ['GET', `/api/community/products/${PRODUCT_ID}`],
    ];
    for (const [method, path] of routes) {
      expect((await app.request(path, { method })).status).toBe(401);
    }
  });
});

describe('community route validation', () => {
  test('refuses a malformed id with 422', async () => {
    const requests = [
      call('GET', '/api/community/groups/not-a-uuid'),
      call('POST', '/api/community/groups/not-a-uuid/join'),
      call('POST', '/api/community/groups/not-a-uuid/reports', {
        reason: COMMUNITY_REPORT_REASON.scam,
      }),
      call('GET', '/api/community/products/not-a-uuid'),
    ];
    for (const res of await Promise.all(requests)) expect(await problemOf(res)).toEqual(INVALID);
  });

  test('refuses an unknown product kind with 422', async () => {
    expect(await problemOf(await call('GET', '/api/community/products?kind=webinar'))).toEqual(
      INVALID,
    );
  });

  test('refuses a missing or unknown report reason with 422', async () => {
    const missing = await call('POST', REPORTS, { story: 'Minta transfer' });
    const unknown = await call('POST', REPORTS, { reason: 'spam' });
    expect(await problemOf(missing)).toEqual(INVALID);
    expect(await problemOf(unknown)).toEqual(INVALID);
  });

  test('counts the story in characters, as the app does', async () => {
    const family = '👨‍👩‍👧';
    const fits = await call('POST', REPORTS, {
      reason: COMMUNITY_REPORT_REASON.scam,
      story: family.repeat(COMMUNITY_REPORT_STORY_MAX),
    });
    const hundredAndOne = await call('POST', REPORTS, {
      reason: COMMUNITY_REPORT_REASON.other,
      story: family.repeat(101),
    });
    const over = await call('POST', REPORTS, {
      reason: COMMUNITY_REPORT_REASON.scam,
      story: family.repeat(COMMUNITY_REPORT_STORY_MAX + 1),
    });

    expect(family.repeat(101).length).toBeGreaterThan(COMMUNITY_REPORT_STORY_MAX);
    expect(fits.status).toBe(201);
    expect(await hundredAndOne.json()).toEqual({ id: REPORT_ID });
    expect(await problemOf(over)).toEqual(INVALID);
  });

  test('sees a Lainnya story of whitespace and invisible characters as blank', async () => {
    const other = COMMUNITY_REPORT_REASON.other;
    for (const story of ['​', ' ‌‍ ', '⁠\n', '﻿\t', '­']) {
      expect(await problemOf(await call('POST', REPORTS, { reason: other, story }))).toEqual(
        INVALID,
      );
    }
    expect((await call('POST', REPORTS, { reason: other, story: '​Minta' })).status).toBe(201);
  });
});
