/**
 * The community module's work outside its routes: syncing the curated catalog at boot, and the
 * person's community rows for Unduh Datamu (the rules accepted, the groups opened, the reports).
 */

import { env } from '../../env.ts';
import { COMMUNITY_PLATFORM, COMMUNITY_REPORT_REASON } from '../../lib/constants/community.ts';
import type { ExportSection } from '../../lib/export/export-section.ts';
import { logger } from '../../lib/server/logger.ts';
import { wibDate } from '../../lib/time/wib.ts';
import { CATALOG_CATEGORIES, CATALOG_GROUPS } from './community-groups.catalog.ts';
import { CATALOG_PRODUCTS } from './community-products.catalog.ts';
import { communityCatalogRepository } from './community-catalog.repository.ts';
import type { CommunityCatalogRepository } from './community-catalog.repository.ts';
import type { Platform, ReportReason } from './community.schema.ts';

export type CatalogDeps = {
  repository?: CommunityCatalogRepository;
  /** COMMUNITY_LINKS_JSON: a group's or a product's id to its verified link. */
  links?: Readonly<Record<string, string>>;
};

/** The hosts an invite may open, per platform: a link elsewhere is never handed out. */
const INVITE_HOSTS: Record<Platform, readonly string[]> = {
  [COMMUNITY_PLATFORM.whatsapp]: ['chat.whatsapp.com'],
  [COMMUNITY_PLATFORM.telegram]: ['t.me'],
  [COMMUNITY_PLATFORM.discord]: ['discord.gg', 'discord.com'],
};

/** The group's verified invite, or null when none is set or it leaves the group's platform. */
function inviteOf(id: string, platform: Platform, links: Readonly<Record<string, string>>) {
  const link = links[id];
  if (link === undefined) return null;
  if (INVITE_HOSTS[platform].includes(new URL(link).hostname)) return link;
  logger.warn({ groupId: id, platform }, 'Community invite link is not on the group platform');
  return null;
}

/** Laporkan Grup's reasons, as the sheet words them. */
const REASON_LABEL: Record<ReportReason, string> = {
  [COMMUNITY_REPORT_REASON.defaultInvite]: 'Ajakan Gagal Bayar',
  [COMMUNITY_REPORT_REASON.guaranteedProfit]: 'Janji Untung Pasti',
  [COMMUNITY_REPORT_REASON.scam]: 'Penipuan atau Minta Transfer',
  [COMMUNITY_REPORT_REASON.dataOrJockey]: 'Jual Data atau Joki',
  [COMMUNITY_REPORT_REASON.inappropriate]: 'Konten Tidak Pantas',
  [COMMUNITY_REPORT_REASON.other]: 'Lainnya',
};

/**
 * Writes the curated categories, groups and products with the links the curation team set
 * (idempotent; safe beside another instance booting) and says how many of each it wrote.
 */
export async function syncCommunityCatalog(deps: CatalogDeps = {}) {
  const repository = deps.repository ?? communityCatalogRepository;
  const links = deps.links ?? env.COMMUNITY_LINKS_JSON;
  const groups = CATALOG_GROUPS.map((group) =>
    Object.assign({}, group, { inviteUrl: inviteOf(group.id, group.platform, links) }),
  );
  const products = CATALOG_PRODUCTS.map((product) =>
    Object.assign({}, product, { sellerUrl: links[product.id] ?? null }),
  );
  await repository.syncCatalog({ categories: CATALOG_CATEGORIES, groups, products });
  return {
    categories: CATALOG_CATEGORIES.length,
    groups: groups.length,
    products: products.length,
    links:
      groups.filter((group) => group.inviteUrl !== null).length +
      products.filter((product) => product.sellerUrl !== null).length,
  };
}

/** The person's community rows as Unduh Datamu's blocks; an empty block is left out. */
export async function communityExportSections(
  userId: string,
  deps: CatalogDeps = {},
): Promise<ExportSection[]> {
  const repository = deps.repository ?? communityCatalogRepository;
  const { consents, joins, reports } = await repository.listExportRows(userId);
  const sections: ExportSection[] = [
    {
      title: 'Komunitas · Aturan yang Disetujui',
      header: ['Tanggal', 'Versi Aturan'],
      rows: consents.map((row) => [wibDate(row.acceptedAt), row.version]),
    },
    {
      title: 'Komunitas · Grup yang Dibuka',
      header: ['Tanggal', 'Grup'],
      rows: joins.map((row) => [wibDate(row.openedAt), row.groupName]),
    },
    {
      title: 'Komunitas · Laporan Grup',
      header: ['Tanggal', 'Grup', 'Alasan', 'Cerita'],
      rows: reports.map((row) => [
        wibDate(row.createdAt),
        row.groupName,
        REASON_LABEL[row.reason],
        row.story ?? '',
      ]),
    },
  ];
  return sections.filter((section) => section.rows.length > 0);
}
