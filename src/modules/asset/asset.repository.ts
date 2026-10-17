/**
 * The asset module's data access (AGENTS.md Rules 4 and 10): a person's assets, newest value
 * first, and adding or changing one of them.
 */

import { and, desc, eq } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { db } from '../../db/client/index.ts';
import { assets } from '../../db/schema/schema.ts';
import type { Asset, AssetInput, AssetPatch } from './asset.schema.ts';

const columns = {
  id: assets.id,
  assetClass: assets.assetClass,
  name: assets.name,
  value: assets.value,
  valuedOn: assets.valuedOn,
};

export type AssetRepository = {
  list(userId: string): Promise<Asset[]>;
  create(userId: string, input: AssetInput): Promise<Asset>;
  /** The changed asset, or null when the person has none with this id. */
  update(userId: string, id: string, patch: AssetPatch): Promise<Asset | null>;
};

export function createAssetRepository(client: PostgresJsDatabase = db): AssetRepository {
  return {
    list(userId) {
      return client
        .select(columns)
        .from(assets)
        .where(eq(assets.userId, userId))
        .orderBy(desc(assets.valuedOn), desc(assets.createdAt));
    },

    async create(userId, input) {
      const [row] = await client
        .insert(assets)
        .values({ userId, ...input })
        .returning(columns);
      if (!row) throw new Error('The asset was not stored');
      return row;
    },

    async update(userId, id, patch) {
      const [row] = await client
        .update(assets)
        .set(patch)
        .where(and(eq(assets.id, id), eq(assets.userId, userId)))
        .returning(columns);
      return row ?? null;
    },
  };
}

export const assetRepository = createAssetRepository();
