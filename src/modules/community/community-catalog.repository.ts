/**
 * The community module's data access outside its routes (AGENTS.md Rules 4 and 10): the boot-time
 * sync of the curated catalog, and a person's community rows for Unduh Datamu.
 */

import { asc, desc, eq, getTableColumns, sql } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { db } from '../../db/client/index.ts';
import {
  communityCategories,
  communityGroupJoins,
  communityGroups,
  communityProducts,
  communityReports,
  communityRulesConsents,
} from '../../db/schema/schema.ts';
import { COMMUNITY_CATALOG_LOCK, COMMUNITY_LIST_LIMIT } from '../../lib/constants/community.ts';
import type { CatalogCategory, CatalogGroup } from './community-groups.catalog.ts';
import type { CatalogProduct } from './community-products.catalog.ts';
import type { ReportReason } from './community.schema.ts';

/** A person's community rows, newest first, as Unduh Datamu lists them. */
type CommunityExportRows = {
  consents: { version: string; acceptedAt: Date }[];
  joins: { groupName: string; openedAt: Date }[];
  reports: { groupName: string; reason: ReportReason; story: string | null; createdAt: Date }[];
};

export type CommunityCatalogRepository = {
  /** Upserts every row by its id: content only, never a status the reports or the team set. */
  syncCatalog(catalog: {
    categories: readonly CatalogCategory[];
    groups: readonly (CatalogGroup & { inviteUrl: string | null })[];
    products: readonly (CatalogProduct & { sellerUrl: string | null })[];
  }): Promise<void>;
  listExportRows(userId: string): Promise<CommunityExportRows>;
};

/** Columns the sync never writes on an existing row: the key, what the app sets, the timestamps. */
const KEPT = new Set(['id', 'key', 'status', 'suspendedAt', 'createdAt', 'updatedAt']);

/**
 * The upsert's `set` for `table`: every content column takes the incoming row's value
 * (`excluded.<column>`), and `updated_at` moves.
 */
function contentOf(table: Parameters<typeof getTableColumns>[0]) {
  const content = Object.entries(getTableColumns(table))
    .filter(([key]) => !KEPT.has(key))
    .map(([key, column]) => [key, sql.raw(`excluded.${column.name}`)]);
  const touched = 'updatedAt' in getTableColumns(table) ? [['updatedAt', sql`now()`]] : [];
  return Object.fromEntries([...content, ...touched]);
}

export function createCommunityCatalogRepository(
  client: PostgresJsDatabase = db,
): CommunityCatalogRepository {
  return {
    async syncCatalog({ categories, groups, products }) {
      await client.transaction(async (tx) => {
        /** Two instances booting together sync one after the other, never interleaved. */
        await tx.execute(
          sql`select pg_advisory_xact_lock(hashtextextended(${COMMUNITY_CATALOG_LOCK}, 0))`,
        );
        await tx
          .insert(communityCategories)
          .values([...categories])
          .onConflictDoUpdate({
            target: communityCategories.key,
            set: contentOf(communityCategories),
          });
        await tx
          .insert(communityGroups)
          .values([...groups])
          .onConflictDoUpdate({ target: communityGroups.id, set: contentOf(communityGroups) });
        await tx
          .insert(communityProducts)
          .values([...products])
          .onConflictDoUpdate({ target: communityProducts.id, set: contentOf(communityProducts) });
      });
    },

    async listExportRows(userId) {
      const [consents, joins, reports] = await Promise.all([
        client
          .select({
            version: communityRulesConsents.version,
            acceptedAt: communityRulesConsents.acceptedAt,
          })
          .from(communityRulesConsents)
          .where(eq(communityRulesConsents.userId, userId))
          .orderBy(asc(communityRulesConsents.acceptedAt))
          .limit(COMMUNITY_LIST_LIMIT),
        client
          .select({ groupName: communityGroups.name, openedAt: communityGroupJoins.openedAt })
          .from(communityGroupJoins)
          .innerJoin(communityGroups, eq(communityGroups.id, communityGroupJoins.groupId))
          .where(eq(communityGroupJoins.userId, userId))
          .orderBy(desc(communityGroupJoins.openedAt))
          .limit(COMMUNITY_LIST_LIMIT),
        client
          .select({
            groupName: communityGroups.name,
            reason: communityReports.reason,
            story: communityReports.story,
            createdAt: communityReports.createdAt,
          })
          .from(communityReports)
          .innerJoin(communityGroups, eq(communityGroups.id, communityReports.groupId))
          .where(eq(communityReports.userId, userId))
          .orderBy(desc(communityReports.createdAt))
          .limit(COMMUNITY_LIST_LIMIT),
      ]);
      return { consents, joins, reports };
    },
  };
}

export const communityCatalogRepository = createCommunityCatalogRepository();
