import { ASSET_CLASS } from '../../../lib/constants/asset.ts';
import type { Asset } from '../asset.schema.ts';

export const ASSET_ID = '5b9f1c2e-8a3d-4e6f-9b1a-2c3d4e5f6a7b';

/** An asset as the API answers it; `overrides` change one field. */
export function createAssetMock(overrides: Partial<Asset> = {}): Asset {
  return {
    id: ASSET_ID,
    assetClass: ASSET_CLASS.gold,
    name: 'Emas Antam',
    value: 15_000_000,
    valuedOn: '2026-10-01',
    ...overrides,
  };
}
