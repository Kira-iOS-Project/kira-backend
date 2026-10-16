/**
 * Terhubung (KOM-01 to KOM-08): the groups and Etalase products the Kira team curates (synced from
 * `community.catalog.ts` at boot, no admin UI in this build), the community-rules consents, the
 * reports that take a group down, and the record of each Gabung Grup.
 */

import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  date,
  index,
  integer,
  pgEnum,
  pgTable,
  smallint,
  text,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import {
  COMMUNITY_CATEGORY,
  COMMUNITY_LISTING_STATUS,
  COMMUNITY_PLATFORM,
  COMMUNITY_PRODUCT_KIND,
  COMMUNITY_REPORT_REASON,
  COMMUNITY_REPORT_STATUS,
  COMMUNITY_REPORT_STORY_MAX,
  OPEN_REPORT_INDEX,
} from '../../lib/constants/community.ts';
import { enumValues } from '../../lib/constants/enum-values.ts';
import { MAX_UNITS_PER_CHARACTER } from '../../lib/constants/text.ts';
import { users } from './accounts.ts';
import { moment, timestamps } from './columns.ts';

export const communityCategoryEnum = pgEnum('community_category', enumValues(COMMUNITY_CATEGORY));
export const communityPlatformEnum = pgEnum('community_platform', enumValues(COMMUNITY_PLATFORM));
export const communityListingStatusEnum = pgEnum(
  'community_listing_status',
  enumValues(COMMUNITY_LISTING_STATUS),
);
export const communityReportReasonEnum = pgEnum(
  'community_report_reason',
  enumValues(COMMUNITY_REPORT_REASON),
);
export const communityReportStatusEnum = pgEnum(
  'community_report_status',
  enumValues(COMMUNITY_REPORT_STATUS),
);
export const communityProductKindEnum = pgEnum(
  'community_product_kind',
  enumValues(COMMUNITY_PRODUCT_KIND),
);

const openStatus = sql.raw(`'${COMMUNITY_REPORT_STATUS.open}'`);

/** Komunitas's chips: the key and the words the team gives it, in curation order. */
export const communityCategories = pgTable('community_categories', {
  key: communityCategoryEnum('key').primaryKey(),
  label: text('label').notNull(),
  rank: smallint('rank').notNull(),
});

/** A curated, admin-verified group. Listed while `active`, in `curation_rank` order. */
export const communityGroups = pgTable(
  'community_groups',
  {
    id: uuid('id').primaryKey(),
    name: text('name').notNull(),
    category: communityCategoryEnum('category')
      .references(() => communityCategories.key)
      .notNull(),
    platform: communityPlatformEnum('platform').notNull(),
    memberCount: integer('member_count').notNull(),
    summary: text('summary').notNull(),
    about: text('about').notNull(),
    /** The illustration Komunitas draws (paylater, saham, kripto, gaji, …). */
    icon: text('icon').notNull(),
    educationOnly: boolean('education_only').notNull(),
    adminName: text('admin_name').notNull(),
    adminInitials: text('admin_initials').notNull(),
    /** "Admin terverifikasi sejak Maret 2026": the first day of that month. */
    adminVerifiedSince: date('admin_verified_since', { mode: 'string' }).notNull(),
    /** Aturan Utama: the group's three rules. */
    rules: text('rules').array().notNull(),
    /** The verified invite (COMMUNITY_LINKS_JSON); null while the team checks it. */
    inviteUrl: text('invite_url'),
    linkCheckedOn: date('link_checked_on', { mode: 'string' }).notNull(),
    adminUnchanged: boolean('admin_unchanged').notNull(),
    curationRank: smallint('curation_rank').notNull(),
    /** Set by reports (and, later, the team); never by the catalog sync. */
    status: communityListingStatusEnum('status').default(COMMUNITY_LISTING_STATUS.active).notNull(),
    suspendedAt: moment('suspended_at'),
    ...timestamps,
  },
  (table) => [
    index('community_groups_status_rank_idx').on(table.status, table.curationRank),
    index('community_groups_category_idx').on(table.category),
    check('community_groups_member_count_check', sql`${table.memberCount} >= 0`),
    check('community_groups_three_rules_check', sql`cardinality(${table.rules}) = 3`),
  ],
);

/** Aturan Komunitas Kira accepted, once a person per version. */
export const communityRulesConsents = pgTable(
  'community_rules_consents',
  {
    userId: uuid('user_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    version: text('version').notNull(),
    acceptedAt: moment('accepted_at').defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('community_rules_consents_user_version_idx').on(table.userId, table.version),
  ],
);

/** Laporkan Grup. The reporter is never shown to the group's admins. */
export const communityReports = pgTable(
  'community_reports',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    groupId: uuid('group_id')
      .references(() => communityGroups.id, { onDelete: 'cascade' })
      .notNull(),
    userId: uuid('user_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    reason: communityReportReasonEnum('reason').notNull(),
    story: text('story'),
    status: communityReportStatusEnum('status').default(COMMUNITY_REPORT_STATUS.open).notNull(),
    ...timestamps,
  },
  (table) => [
    uniqueIndex(OPEN_REPORT_INDEX)
      .on(table.groupId, table.userId)
      .where(sql`${table.status} = ${openStatus}`),
    index('community_reports_group_created_idx').on(table.groupId, table.createdAt),
    index('community_reports_user_idx').on(table.userId),
    /**
     * The API counts the story in characters (grapheme clusters), which Postgres cannot; the
     * database holds the bound in code points that every accepted story stays within.
     */
    check(
      'community_reports_story_check',
      sql`${table.story} IS NULL OR char_length(${table.story}) <= ${sql.raw(String(COMMUNITY_REPORT_STORY_MAX * MAX_UNITS_PER_CHARACTER))}`,
    ),
  ],
);

/** Each Gabung Grup that handed out the invite (the tautan keluar opened). */
export const communityGroupJoins = pgTable(
  'community_group_joins',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    groupId: uuid('group_id')
      .references(() => communityGroups.id, { onDelete: 'cascade' })
      .notNull(),
    userId: uuid('user_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    openedAt: moment('opened_at').defaultNow().notNull(),
  },
  (table) => [
    index('community_group_joins_group_idx').on(table.groupId),
    index('community_group_joins_user_idx').on(table.userId),
  ],
);

/** An Etalase product of a verified seller. Payment happens on the seller's page, never in Kira. */
export const communityProducts = pgTable(
  'community_products',
  {
    id: uuid('id').primaryKey(),
    kind: communityProductKindEnum('kind').notNull(),
    title: text('title').notNull(),
    sellerName: text('seller_name').notNull(),
    sellerInitials: text('seller_initials').notNull(),
    /** "Perencana Bersertifikat", "Terverifikasi": the check the seller passed. */
    sellerBadge: text('seller_badge').notNull(),
    sellerRole: text('seller_role').notNull(),
    /** Whole rupiah; null is Gratis. */
    price: integer('price'),
    icon: text('icon').notNull(),
    description: text('description').notNull(),
    meta: text('meta').notNull(),
    contentsTitle: text('contents_title').notNull(),
    contents: text('contents').array().notNull(),
    affiliate: boolean('affiliate').notNull(),
    investmentRisk: boolean('investment_risk').notNull(),
    /** The seller's page (COMMUNITY_LINKS_JSON); null while the team checks it. */
    sellerUrl: text('seller_url'),
    curationRank: smallint('curation_rank').notNull(),
    status: communityListingStatusEnum('status').default(COMMUNITY_LISTING_STATUS.active).notNull(),
    ...timestamps,
  },
  (table) => [
    index('community_products_status_rank_idx').on(table.status, table.curationRank),
    index('community_products_kind_idx').on(table.kind),
    check('community_products_price_check', sql`${table.price} IS NULL OR ${table.price} > 0`),
  ],
);
