/**
 * The asset routes through the real app, the session gate and the shared Postgres double.
 */

import { beforeEach, describe, expect, test } from 'bun:test';
import { app } from '../../../app.ts';
import { ASSET_CLASS } from '../../../lib/constants/asset.ts';
import { dbControl, resetExternalMocks } from '../../../test/preload.ts';
import { AUTH_HEADER, signedIn } from '../../../test/session.ts';
import { ASSET_ID, createAssetMock } from './helpers.ts';

beforeEach(() => resetExternalMocks());

function send(method: string, path: string, body?: unknown) {
  return app.request(path, {
    method,
    headers: { 'Content-Type': 'application/json', ...AUTH_HEADER },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

const asset = createAssetMock();
const input = {
  assetClass: ASSET_CLASS.gold,
  name: 'Emas Antam',
  value: 15_000_000,
  valuedOn: '2026-10-01',
};

describe('GET /api/assets', () => {
  test('answers the portfolio with its total; Utang terhadap Aset is null before the health check', async () => {
    /** The list, not the score's subquery that also reads "assets". */
    const isList = (sql: string) => sql.includes('from "assets"') && !sql.includes('from "users"');
    dbControl.respond = signedIn((query) => (isList(query.sql) ? [asset] : []));
    const res = await send('GET', '/api/assets');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      assets: [asset],
      total: 15_000_000,
      updatedOn: '2026-10-01',
      debtToAsset: null,
    });
  });
});

describe('POST /api/assets', () => {
  test('answers 201 with the saved asset', async () => {
    dbControl.respond = signedIn((query) =>
      query.sql.startsWith('insert into "assets"') ? [asset] : [],
    );
    const res = await send('POST', '/api/assets', input);
    expect(res.status).toBe(201);
    expect((await res.json()).id).toBe(ASSET_ID);
  });

  test.each([
    ['a blank name', { name: '  ' }, 'name'],
    ['a name over 80 characters', { name: 'a'.repeat(81) }, 'name'],
    ['a value of 0', { value: 0 }, 'value'],
    ['a value over Rp999.999.999.999', { value: 1_000_000_000_000 }, 'value'],
    ['a date in the future', { valuedOn: '2999-01-01' }, 'valuedOn'],
    ['an unknown class', { assetClass: 'house' }, 'assetClass'],
  ])('refuses %s with a 422', async (_, change, field) => {
    dbControl.respond = signedIn();
    const res = await send('POST', '/api/assets', { ...input, ...change });
    expect(res.status).toBe(422);
    expect((await res.json()).fields).toHaveProperty(field);
  });
});

describe('PATCH /api/assets/{id}', () => {
  test('answers 200 with the changed asset', async () => {
    const changed = createAssetMock({ value: 16_000_000 });
    dbControl.respond = signedIn((query) =>
      query.sql.startsWith('update "assets"') ? [changed] : [],
    );
    const res = await send('PATCH', `/api/assets/${ASSET_ID}`, { value: 16_000_000 });
    expect(res.status).toBe(200);
    expect((await res.json()).value).toBe(16_000_000);
  });

  test('answers 404 ASSET_NOT_FOUND for an asset that is not the person’s', async () => {
    dbControl.respond = signedIn();
    const res = await send('PATCH', `/api/assets/${ASSET_ID}`, { name: 'Emas' });
    expect(res.status).toBe(404);
    expect((await res.json()).code).toBe('ASSET_NOT_FOUND');
  });

  test('refuses an empty change with a 422', async () => {
    dbControl.respond = signedIn();
    const res = await send('PATCH', `/api/assets/${ASSET_ID}`, {});
    expect(res.status).toBe(422);
  });

  test('needs a session', async () => {
    const res = await app.request('/api/assets');
    expect(res.status).toBe(401);
  });
});
