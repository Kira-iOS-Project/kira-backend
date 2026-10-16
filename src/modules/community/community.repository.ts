/**
 * The community module's data access (AGENTS.md Rules 4 and 10): the curated groups and products,
 * the rules consents, Gabung Grup records and reports. A report is filed inside one transaction
 * that holds the group's row lock, so its duplicate check, its insert and the take-down count are
 * decided one report at a time (Rule 24's shape).
 */

import { and, asc, countDistinct, eq, gte, sql } from 'drizzle-orm';
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
import {
  COMMUNITY_LISTING_STATUS,
  COMMUNITY_LIST_LIMIT,
  COMMUNITY_REPORT_STATUS,
} from '../../lib/constants/community.ts';
import type { Category, ProductKind, ReportReason } from './community.schema.ts';

const groupColumns = {
  id: communityGroups.id,
  name: communityGroups.name,
  category: communityGroups.category,
  platform: communityGroups.platform,
  memberCount: communityGroups.memberCount,
  summary: communityGroups.summary,
  icon: communityGroups.icon,
  educationOnly: communityGroups.educationOnly,
  about: communityGroups.about,
  adminName: communityGroups.adminName,
  adminInitials: communityGroups.adminInitials,
  adminVerifiedSince: communityGroups.adminVerifiedSince,
  rules: communityGroups.rules,
  inviteUrl: communityGroups.inviteUrl,
  linkCheckedOn: communityGroups.linkCheckedOn,
  adminUnchanged: communityGroups.adminUnchanged,
};

const productColumns = {
  id: communityProducts.id,
  kind: communityProducts.kind,
  title: communityProducts.title,
  sellerName: communityProducts.sellerName,
  sellerInitials: communityProducts.sellerInitials,
  sellerBadge: communityProducts.sellerBadge,
  price: communityProducts.price,
  icon: communityProducts.icon,
  description: communityProducts.description,
  meta: communityProducts.meta,
  sellerRole: communityProducts.sellerRole,
  contentsTitle: communityProducts.contentsTitle,
  contents: communityProducts.contents,
  affiliate: communityProducts.affiliate,
  investmentRisk: communityProducts.investmentRisk,
  sellerUrl: communityProducts.sellerUrl,
};

/** A group's row, everything Detail Grup shows and the invite. */
export type GroupRow = Pick<typeof communityGroups.$inferSelect, keyof typeof groupColumns>;
/** A product's row, everything Detail Produk shows. */
export type ProductRow = Pick<typeof communityProducts.$inferSelect, keyof typeof productColumns>;
export type CategoryRow = { key: Category; label: string };

/** What filing a report came to. */
export type ReportOutcome =
  | { kind: 'filed'; id: string; suspended: boolean }
  | { kind: 'duplicate' }
  | { kind: 'missing' };

export type CommunityRepository = {
  listCategories(): Promise<CategoryRow[]>;
  listActiveGroups(category: Category | undefined): Promise<GroupRow[]>;
  findActiveGroup(id: string): Promise<GroupRow | null>;
  hasAcceptedRules(userId: string, version: string): Promise<boolean>;
  /** Stores the consent; accepting the same version again changes nothing. */
  acceptRules(userId: string, version: string): Promise<void>;
  recordJoin(userId: string, groupId: string): Promise<void>;
  /**
   * Files the report unless the person has one open on the group, then takes the group down when
   * `threshold` different people reported it since `since`.
   */
  fileReport(input: {
    userId: string;
    groupId: string;
    reason: ReportReason;
    story: string | null;
    since: Date;
    threshold: number;
  }): Promise<ReportOutcome>;
  listActiveProducts(kind: ProductKind | undefined): Promise<ProductRow[]>;
  findActiveProduct(id: string): Promise<ProductRow | null>;
};

const active = COMMUNITY_LISTING_STATUS.active;

export function createCommunityRepository(client: PostgresJsDatabase = db): CommunityRepository {
  return {
    async listCategories() {
      return client
        .select({ key: communityCategories.key, label: communityCategories.label })
        .from(communityCategories)
        .orderBy(asc(communityCategories.rank))
        .limit(COMMUNITY_LIST_LIMIT);
    },

    async listActiveGroups(category) {
      return client
        .select(groupColumns)
        .from(communityGroups)
        .where(
          and(
            eq(communityGroups.status, active),
            category === undefined ? undefined : eq(communityGroups.category, category),
          ),
        )
        .orderBy(asc(communityGroups.curationRank), asc(communityGroups.id))
        .limit(COMMUNITY_LIST_LIMIT);
    },

    async findActiveGroup(id) {
      const [row] = await client
        .select(groupColumns)
        .from(communityGroups)
        .where(and(eq(communityGroups.id, id), eq(communityGroups.status, active)))
        .limit(1);
      return row ?? null;
    },

    async hasAcceptedRules(userId, version) {
      const [row] = await client
        .select({ version: communityRulesConsents.version })
        .from(communityRulesConsents)
        .where(
          and(
            eq(communityRulesConsents.userId, userId),
            eq(communityRulesConsents.version, version),
          ),
        )
        .limit(1);
      return row !== undefined;
    },

    async acceptRules(userId, version) {
      await client.insert(communityRulesConsents).values({ userId, version }).onConflictDoNothing();
    },

    async recordJoin(userId, groupId) {
      await client.insert(communityGroupJoins).values({ userId, groupId });
    },

    fileReport({ userId, groupId, reason, story, since, threshold }) {
      return client.transaction(async (tx): Promise<ReportOutcome> => {
        const [group] = await tx
          .select({ status: communityGroups.status })
          .from(communityGroups)
          .where(eq(communityGroups.id, groupId))
          .limit(1)
          .for('update');
        if (group?.status !== active) return { kind: 'missing' };
        const [open] = await tx
          .select({ id: communityReports.id })
          .from(communityReports)
          .where(
            and(
              eq(communityReports.groupId, groupId),
              eq(communityReports.userId, userId),
              eq(communityReports.status, COMMUNITY_REPORT_STATUS.open),
            ),
          )
          .limit(1);
        if (open) return { kind: 'duplicate' };
        const [filed] = await tx
          .insert(communityReports)
          .values({ groupId, userId, reason, story })
          .returning({ id: communityReports.id });
        const [recent] = await tx
          .select({ reporters: countDistinct(communityReports.userId) })
          .from(communityReports)
          .where(
            and(eq(communityReports.groupId, groupId), gte(communityReports.createdAt, since)),
          );
        const suspended = (recent?.reporters ?? 0) >= threshold;
        if (suspended) {
          await tx
            .update(communityGroups)
            .set({ status: COMMUNITY_LISTING_STATUS.suspended, suspendedAt: sql`now()` })
            .where(eq(communityGroups.id, groupId));
        }
        return { kind: 'filed', id: filed?.id ?? '', suspended };
      });
    },

    async listActiveProducts(kind) {
      return client
        .select(productColumns)
        .from(communityProducts)
        .where(
          and(
            eq(communityProducts.status, active),
            kind === undefined ? undefined : eq(communityProducts.kind, kind),
          ),
        )
        .orderBy(asc(communityProducts.curationRank), asc(communityProducts.id))
        .limit(COMMUNITY_LIST_LIMIT);
    },

    async findActiveProduct(id) {
      const [row] = await client
        .select(productColumns)
        .from(communityProducts)
        .where(and(eq(communityProducts.id, id), eq(communityProducts.status, active)))
        .limit(1);
      return row ?? null;
    },
  };
}

export const communityRepository = createCommunityRepository();
