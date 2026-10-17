import { describe, expect, test } from 'bun:test';
import { ASSET_CLASS } from '../../../lib/constants/asset.ts';
import { createFakeDb, inOrder } from '../../../test/fake-postgres.ts';
import { createAssetRepository } from '../asset.repository.ts';
import { ASSET_ID, createAssetMock } from './helpers.ts';

const asset = createAssetMock();

describe('createAssetRepository', () => {
  test('lists a person’s assets, newest value first', async () => {
    const fake = createFakeDb(inOrder([asset]));
    expect(await createAssetRepository(fake.db).list('user-1')).toEqual([asset]);
    expect(fake.queries[0]?.sql).toContain('order by "assets"."valued_on" desc');
    expect(fake.queries[0]?.params).toContain('user-1');
  });

  test('adds an asset for the person', async () => {
    const fake = createFakeDb(inOrder([asset]));
    const input = {
      assetClass: ASSET_CLASS.gold,
      name: 'Emas Antam',
      value: 15_000_000,
      valuedOn: '2026-10-01',
    };
    expect(await createAssetRepository(fake.db).create('user-1', input)).toEqual(asset);
    expect(fake.queries[0]?.sql).toStartWith('insert into "assets"');
  });

  test('fails loudly when the asset is not stored', async () => {
    const fake = createFakeDb(inOrder([]));
    const input = {
      assetClass: ASSET_CLASS.gold,
      name: 'Emas Antam',
      value: 15_000_000,
      valuedOn: '2026-10-01',
    };
    await expect(createAssetRepository(fake.db).create('user-1', input)).rejects.toThrow(
      'The asset was not stored',
    );
  });

  test('changes only the person’s own asset, else answers null', async () => {
    const fake = createFakeDb(inOrder([asset], []));
    const repository = createAssetRepository(fake.db);
    expect(await repository.update('user-1', ASSET_ID, { value: 15_000_000 })).toEqual(asset);
    expect(await repository.update('user-2', ASSET_ID, { value: 1 })).toBeNull();
    expect(fake.queries[1]?.params).toEqual(expect.arrayContaining([ASSET_ID, 'user-2']));
  });
});
