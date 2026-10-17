/**
 * Terhubung (KOM-01 to KOM-07d): the curated groups in curation order, never by members; Gabung
 * Grup only after the current Aturan Komunitas Kira; Laporkan Grup, one open report a person per
 * group, with the take-down threshold; and Etalase's products.
 */

import {
  COMMUNITY_RULES_VERSION,
  COMMUNITY_SUSPENSION_REPORTERS,
  COMMUNITY_SUSPENSION_WINDOW_MS,
} from '../../lib/constants/community.ts';
import { logger } from '../../lib/server/logger.ts';
import { isBlank } from '../../lib/text/characters.ts';
import {
  CommunityGroupNotFoundError,
  CommunityLinkUnavailableError,
  CommunityProductNotFoundError,
  CommunityReportDuplicateError,
  CommunityRulesNotAcceptedError,
} from './community.errors.ts';
import { communityRepository } from './community.repository.ts';
import type { CommunityRepository, GroupRow, ProductRow } from './community.repository.ts';
import type {
  GroupDetail,
  GroupSummary,
  GroupsQuery,
  GroupsResponse,
  JoinResponse,
  ProductDetail,
  ProductSummary,
  ProductsQuery,
  ReportBody,
} from './community.schema.ts';

export type CommunityDeps = { repository?: CommunityRepository; now?: () => Date };

function resolve(deps: CommunityDeps) {
  return {
    repository: deps.repository ?? communityRepository,
    now: deps.now ?? (() => new Date()),
  };
}

function groupSummary(row: GroupRow): GroupSummary {
  const { id, name, category, platform, memberCount, summary, icon, educationOnly } = row;
  return { id, name, category, platform, memberCount, summary, icon, educationOnly };
}

function productSummary(row: ProductRow): ProductSummary {
  const { id, kind, title, sellerName, sellerInitials, sellerBadge, price, icon } = row;
  return { id, kind, title, sellerName, sellerInitials, sellerBadge, price, icon };
}

async function activeGroup(repository: CommunityRepository, id: string): Promise<GroupRow> {
  const row = await repository.findActiveGroup(id);
  if (!row) throw new CommunityGroupNotFoundError();
  return row;
}

/** GET /community/groups: Komunitas, filtered by its chip. */
export async function listGroups(
  query: GroupsQuery,
  deps: CommunityDeps = {},
): Promise<GroupsResponse> {
  const { repository } = resolve(deps);
  const [categories, rows] = await Promise.all([
    repository.listCategories(),
    repository.listActiveGroups(query.category),
  ]);
  return { categories, groups: rows.map(groupSummary) };
}

/** GET /community/groups/{id}: Detail Grup, with whether the current rules were accepted. */
export async function getGroup(
  userId: string,
  id: string,
  deps: CommunityDeps = {},
): Promise<GroupDetail> {
  const { repository } = resolve(deps);
  const [row, rulesAccepted] = await Promise.all([
    activeGroup(repository, id),
    repository.hasAcceptedRules(userId, COMMUNITY_RULES_VERSION),
  ]);
  return {
    ...groupSummary(row),
    about: row.about,
    admin: {
      name: row.adminName,
      initials: row.adminInitials,
      verifiedSince: row.adminVerifiedSince.slice(0, 7),
    },
    rules: row.rules,
    /** Nothing about a link is shown while there is none to open. */
    linkCheckedOn: row.inviteUrl === null ? null : row.linkCheckedOn,
    adminUnchanged: row.inviteUrl === null ? null : row.adminUnchanged,
    rulesAccepted,
  };
}

/** POST /community/rules/consent: Setuju dan Lanjut. The schema admits only the current version. */
export async function acceptRules(
  userId: string,
  version: string,
  deps: CommunityDeps = {},
): Promise<void> {
  await resolve(deps).repository.acceptRules(userId, version);
}

/**
 * POST /community/groups/{id}/join: the invite, once the current rules are accepted and the team
 * has a verified link for the group.
 */
export async function joinGroup(
  userId: string,
  id: string,
  deps: CommunityDeps = {},
): Promise<JoinResponse> {
  const { repository } = resolve(deps);
  const [row, rulesAccepted] = await Promise.all([
    activeGroup(repository, id),
    repository.hasAcceptedRules(userId, COMMUNITY_RULES_VERSION),
  ]);
  if (!rulesAccepted) throw new CommunityRulesNotAcceptedError();
  /** An invite is handed out only with the date it was checked. */
  if (row.inviteUrl === null || row.linkCheckedOn === null) {
    throw new CommunityLinkUnavailableError();
  }
  await repository.recordJoin(userId, row.id);
  return { inviteUrl: row.inviteUrl, platform: row.platform, linkCheckedOn: row.linkCheckedOn };
}

/** POST /community/groups/{id}/reports: Kirim Laporan. */
export async function reportGroup(
  userId: string,
  groupId: string,
  body: ReportBody,
  deps: CommunityDeps = {},
): Promise<{ id: string }> {
  const { repository, now } = resolve(deps);
  const story = body.story && !isBlank(body.story) ? body.story.trim() : null;
  const outcome = await repository.fileReport({
    userId,
    groupId,
    reason: body.reason,
    story,
    since: new Date(now().getTime() - COMMUNITY_SUSPENSION_WINDOW_MS),
    threshold: COMMUNITY_SUSPENSION_REPORTERS,
  });
  if (outcome.kind === 'missing') throw new CommunityGroupNotFoundError();
  if (outcome.kind === 'duplicate') throw new CommunityReportDuplicateError();
  if (outcome.suspended) logger.warn({ groupId }, 'Community group suspended by reports');
  return { id: outcome.id };
}

/** GET /community/products: Etalase, filtered by its chip. */
export async function listProducts(
  query: ProductsQuery,
  deps: CommunityDeps = {},
): Promise<{ products: ProductSummary[] }> {
  const rows = await resolve(deps).repository.listActiveProducts(query.kind);
  return { products: rows.map(productSummary) };
}

/** GET /community/products/{id}: Detail Produk. */
export async function getProduct(id: string, deps: CommunityDeps = {}): Promise<ProductDetail> {
  const row = await resolve(deps).repository.findActiveProduct(id);
  if (!row) throw new CommunityProductNotFoundError();
  const { description, meta, sellerRole, contentsTitle, contents } = row;
  const { affiliate, investmentRisk, sellerUrl } = row;
  return {
    ...productSummary(row),
    description,
    meta,
    sellerRole,
    contentsTitle,
    contents,
    affiliate,
    investmentRisk,
    sellerUrl,
  };
}
